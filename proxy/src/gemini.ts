// Calls the Gemini REST API with plain fetch (no SDK needed).
// Docs: https://ai.google.dev/api/generate-content

import { AppErrorException } from "./errors.js";
import { parseResultSchema } from "./schema.js";

// You can switch models without code changes: set GEMINI_MODEL in proxy/.env
// Default chosen by timing the full UCSC page (Nov 2026): 3.5-flash-lite got every
// date right in ~40 s; 3.5-flash was also right but ~2x slower; 3.1-flash-lite was
// fast but skipped rows; 3.8-flash was overloaded (503) at the time.
const MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";

// One "part" of a Gemini message: some text, or a file (task 4 adds files).
export type GeminiPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } };

// Sends the prompt + input to Gemini and returns its JSON reply (already parsed).
export async function askGemini(systemPrompt: string, parts: GeminiPart[]): Promise<unknown> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new AppErrorException("PARSE_FAILED", "The server is missing its Gemini API key.");
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
  const body = {
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents: [{ role: "user", parts }],
    generationConfig: {
      temperature: 0, // we want the same, careful answer every time
      responseMimeType: "application/json",
      responseSchema: parseResultSchema,
    },
  };

  // TODO(task 6): add a 30-second timeout (TIMEOUT) and map HTTP 429 to RATE_LIMIT.
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    // Log the details for us; send a simple message to the user.
    console.error("Gemini error", res.status, await res.text());
    throw new AppErrorException("PARSE_FAILED", "Gemini could not read this input. Please try again.", 502);
  }

  const data = await res.json();
  // The JSON we asked for comes back as text inside the first candidate.
  const text: string | undefined = data?.candidates?.[0]?.content?.parts
    ?.map((p: { text?: string }) => p.text ?? "")
    .join("");

  if (!text) {
    console.error("Gemini returned no text", JSON.stringify(data).slice(0, 1000));
    throw new AppErrorException("PARSE_FAILED", "Gemini gave an empty answer. Please try again.", 502);
  }

  try {
    return JSON.parse(text);
  } catch {
    console.error("Gemini returned invalid JSON", text.slice(0, 1000));
    throw new AppErrorException("PARSE_FAILED", "Gemini's answer was not readable. Please try again.", 502);
  }
}
