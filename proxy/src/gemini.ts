// Calls the Gemini REST API with plain fetch (no SDK needed), and turns every
// way it can fail into an AppError.
// Docs: https://ai.google.dev/api/generate-content
//
// Two kinds of request, sharing the same retries and error handling:
//   askGemini       - "answer in this JSON shape" (structured output), used by /parse
//   askGeminiTools  - "call these functions" (function calling), used by /edit
//
// What happens when things go wrong:
//   Gemini busy (503/500)   -> wait a moment and retry; then try the backup model
//   Rate limit (429)        -> try the backup model right away (it has its own limit)
//   Still failing           -> RATE_LIMIT ("busy, try again in a minute")
//   No answer in 30 s total -> TIMEOUT
//   Bad request / bad key   -> PARSE_FAILED (no retry: it would fail the same way)
//   Answer cut off / junk   -> PARSE_FAILED

import { AppErrorException } from "./errors.js";

// You can switch models without code changes: set these in proxy/.env
// Default chosen by timing the full UCSC page (Nov 2026): 3.5-flash-lite got every
// date right in ~40 s; 3.5-flash was also right but ~2x slower; 3.1-flash-lite was
// fast but skipped rows; 3.8-flash was overloaded (503) at the time.
const MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";
const BACKUP_MODEL = process.env.GEMINI_BACKUP_MODEL || "gemini-3.5-flash";

// Total time we wait for Gemini, including retries.
const TIMEOUT_MS = Number(process.env.PARSE_TIMEOUT_MS) || 30_000;

// Only changed by the test script (it points this at a fake Gemini).
const BASE_URL = process.env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com/v1beta";

// One "part" of a Gemini message: some text, or a file (base64).
export type GeminiPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } };

// A function Gemini asked us to run, e.g. { name: "delete_events", args: { ids: ["e3"] } }
export type FunctionCall = { name: string; args: Record<string, unknown> };

// Why one attempt failed, which decides what we do next.
type Failure =
  | { kind: "busy" } // 503, 500: retry this model, then the backup model
  | { kind: "rateLimit" } // 429: go straight to the backup model
  | { kind: "fatal"; error: AppErrorException }; // stop now

type Attempt<T> = { ok: true; value: T } | { ok: false; failure: Failure };

// Turns one successful HTTP reply into the answer we want (or a fatal failure).
type ReadAnswer<T> = (data: GeminiResponse, model: string) => Attempt<T>;
type GeminiResponse = {
  candidates?: { finishReason?: string; content?: { parts?: { text?: string; functionCall?: FunctionCall }[] } }[];
  usageMetadata?: { candidatesTokenCount?: number };
};

// ---------- 1. structured output (/parse) ----------

// Sends the prompt + input to Gemini and returns its JSON reply (already parsed).
// `schema` is the JSON shape Gemini must answer in (see schema.ts).
export async function askGemini(systemPrompt: string, parts: GeminiPart[], schema: object): Promise<unknown> {
  return callGemini(
    {
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: "user", parts }],
      generationConfig: {
        temperature: 0, // we want the same, careful answer every time
        responseMimeType: "application/json",
        responseSchema: schema,
      },
    },
    readJson,
  );
}

function readJson(data: GeminiResponse, model: string): Attempt<unknown> {
  const candidate = data.candidates?.[0];
  const text = (candidate?.content?.parts ?? []).map((p) => p.text ?? "").join("");

  if (candidate?.finishReason === "MAX_TOKENS") {
    // The answer was too long and got cut off in the middle of the JSON.
    console.error(`Gemini answer cut off (${model}), ${text.length} chars`);
    return fatal("There are too many dates to read at once. Try selecting a smaller part.");
  }
  if (!text) {
    // Usually blocked by a safety filter (finishReason SAFETY / PROHIBITED_CONTENT, or promptFeedback).
    console.error(`Gemini returned no text (${model}):`, JSON.stringify(data).slice(0, 500));
    return fatal("Gemini couldn't read any dates from this. Try selecting just the dates.");
  }
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    console.error(`Gemini returned invalid JSON (${model}):`, text.slice(0, 500));
    return fatal("Gemini's answer was not readable. Please try again.");
  }
}

// ---------- 2. function calling (/edit) ----------

// Sends the prompt + input with a list of functions Gemini may call. Returns the calls it
// wants us to run (possibly several at once), plus any text it wrote.
// Docs: https://ai.google.dev/gemini-api/docs/function-calling
export async function askGeminiTools(
  systemPrompt: string,
  parts: GeminiPart[],
  functionDeclarations: object[],
): Promise<{ calls: FunctionCall[]; text: string }> {
  return callGemini(
    {
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: "user", parts }],
      tools: [{ functionDeclarations }],
      // AUTO: Gemini calls functions when the request asks for changes, or just answers in text
      // when it doesn't (e.g. "what's the weather?").
      toolConfig: { functionCallingConfig: { mode: "AUTO" } },
      generationConfig: { temperature: 0 },
    },
    readToolCalls,
  );
}

function readToolCalls(data: GeminiResponse, model: string): Attempt<{ calls: FunctionCall[]; text: string }> {
  const candidate = data.candidates?.[0];
  const parts = candidate?.content?.parts ?? [];
  const calls = parts.filter((p) => p.functionCall?.name).map((p) => ({ name: p.functionCall!.name, args: p.functionCall!.args ?? {} }));
  const text = parts.map((p) => p.text ?? "").join("").trim();

  if (candidate?.finishReason === "MAX_TOKENS") {
    console.error(`Gemini edit answer cut off (${model})`);
    return fatal("That's too many changes at once. Try asking for fewer changes.");
  }
  if (calls.length === 0 && !text) {
    console.error(`Gemini returned nothing (${model}):`, JSON.stringify(data).slice(0, 500));
    return fatal("Gemini couldn't work out what to change. Try saying it another way.");
  }
  return { ok: true, value: { calls, text } };
}

// ---------- shared: retries, backup model, timeout ----------

async function callGemini<T>(request: object, readAnswer: ReadAnswer<T>): Promise<T> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new AppErrorException("PARSE_FAILED", "The server is missing its Gemini API key.");
  }
  const body = JSON.stringify(request);
  const deadline = Date.now() + TIMEOUT_MS;
  let sawRateLimit = false;

  // Plan: main model (up to 2 tries), then backup model (up to 2 tries).
  const models = BACKUP_MODEL && BACKUP_MODEL !== MODEL ? [MODEL, BACKUP_MODEL] : [MODEL];
  for (const model of models) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      const result = await tryOnce(model, body, apiKey, deadline, readAnswer);
      if (result.ok) return result.value;

      const failure = result.failure;
      if (failure.kind === "fatal") throw failure.error;
      if (failure.kind === "rateLimit") {
        sawRateLimit = true;
        break; // retrying the same model won't help; its per-minute limit is used up
      }
      // busy: wait a little before the second try (500 ms, then move on)
      if (attempt === 1) await wait(500, deadline);
    }
    console.warn(`Gemini model ${model} failed; ${model === MODEL && models.length > 1 ? "trying backup model" : "giving up"}`);
  }

  throw new AppErrorException(
    "RATE_LIMIT",
    sawRateLimit
      ? "Too many requests right now. Please wait a minute and try again."
      : "Gemini is very busy right now. Please try again in a minute.",
    429,
  );
}

// One call to one model. Never throws for normal failures: returns what went wrong instead,
// so callGemini can decide whether to retry.
async function tryOnce<T>(
  model: string,
  body: string,
  apiKey: string,
  deadline: number,
  readAnswer: ReadAnswer<T>,
): Promise<Attempt<T>> {
  const timeLeft = deadline - Date.now();
  if (timeLeft <= 0) throw timeoutError();

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}/models/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body,
      signal: AbortSignal.timeout(timeLeft), // stop waiting when our 30 s are up
    });
  } catch (err) {
    if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) throw timeoutError();
    console.error(`Could not reach Gemini (${model}):`, err);
    return { ok: false, failure: { kind: "busy" } }; // network hiccup: treat like "busy"
  }

  if (!res.ok) {
    // Log the details for us; the user gets a simple message.
    const details = await res.text().catch(() => "");
    console.error(`Gemini error ${res.status} (${model}):`, details.slice(0, 500));

    if (res.status === 429) return { ok: false, failure: { kind: "rateLimit" } };
    if (res.status >= 500) return { ok: false, failure: { kind: "busy" } };
    if (res.status === 401 || res.status === 403) {
      return fatal("The server's Gemini key isn't working. Tell the team to check proxy/.env.");
    }
    // 402: the Gemini account's prepaid credits ran out (top up in AI Studio).
    if (res.status === 402) {
      return fatal("Our Gemini account is out of credits. Tell the team to top it up in Google AI Studio.");
    }
    // 400 and anything else: Gemini couldn't use what we sent (e.g. a damaged file).
    return fatal("Gemini could not read this input. Try a different file or a screenshot.");
  }

  let data: GeminiResponse;
  try {
    data = (await res.json()) as GeminiResponse;
  } catch {
    return { ok: false, failure: { kind: "busy" } }; // half-received reply: try again
  }

  // Answer length is what makes Gemini slow, so log it.
  console.log(`Gemini ok (${model}): ${data.usageMetadata?.candidatesTokenCount ?? "?"} output tokens`);
  return readAnswer(data, model);
}

// ---------- small helpers ----------

function fatal(message: string): { ok: false; failure: Failure } {
  return { ok: false, failure: { kind: "fatal", error: new AppErrorException("PARSE_FAILED", message, 502) } };
}

function timeoutError() {
  return new AppErrorException(
    "TIMEOUT",
    "Reading the dates took too long. Try selecting a smaller part, or try again.",
    504,
  );
}

// Waits `ms` milliseconds, but never past the deadline.
function wait(ms: number, deadline: number): Promise<void> {
  const time = Math.max(0, Math.min(ms, deadline - Date.now()));
  return new Promise((resolve) => setTimeout(resolve, time));
}
