// Tests every way Gemini can fail, using a FAKE Gemini on this computer.
// No real Gemini calls, no API key, no quota used. Takes about 15 seconds.
//
// Usage (you do NOT need `npm run dev` running for this one):
//   npm run try:errors
//
// How it works:
//   1. Start a fake Gemini server. Each test puts "SCENARIO:<name>" in its text,
//      and the fake answers according to that scenario (503, 429, junk, never answer...).
//   2. Start our real proxy on port 8091, pointed at the fake (GEMINI_BASE_URL).
//   3. Send each scenario to the proxy and check the AppError (or result) it returns,
//      and which models it called (to check retries and the backup model).

import { spawn } from "node:child_process";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import type { AppError, ParseResult } from "../src/types.js";

const PROXY_PORT = 8091;
const PROXY = `http://localhost:${PROXY_PORT}`;
const TIMEOUT_MS = 3000; // short timeout so the "never answers" test is quick

// ---------- 1. the fake Gemini ----------

const goodEvent = {
  sourceText: "Quarter begins Jan. 4, 2027", title: "Quarter begins", allDay: true,
  start: "2027-01-04", end: "2027-01-04", recurrence: null, location: null, description: null,
  category: "event", yearSource: "written", unsure: false, confidence: 0.95,
};
const geminiReply = (result: unknown, finishReason = "STOP") => ({
  candidates: [{ finishReason, content: { parts: [{ text: typeof result === "string" ? result : JSON.stringify(result) }] } }],
});
const okResult = { calendarName: "Test", timeZone: "America/Los_Angeles", events: [goodEvent] };

const calls: Record<string, string[]> = {}; // scenario -> models called, in order

function answer(scenario: string, model: string, res: ServerResponse) {
  const send = (status: number, body: unknown) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  };
  const busy = () => send(503, { error: { code: 503, message: "high demand", status: "UNAVAILABLE" } });
  const limited = () => send(429, { error: { code: 429, message: "quota", status: "RESOURCE_EXHAUSTED" } });
  const isMain = model === "fake-main";
  const callNumber = calls[scenario].length;

  switch (scenario) {
    case "ok": return send(200, geminiReply(okResult));
    case "busy-once": return callNumber === 1 ? busy() : send(200, geminiReply(okResult));
    case "busy-main": return isMain ? busy() : send(200, geminiReply(okResult));
    case "busy-all": return busy();
    case "ratelimit-main": return isMain ? limited() : send(200, geminiReply(okResult));
    case "ratelimit-all": return limited();
    case "never-answers": return; // just hang
    case "no-events": return send(200, geminiReply({ ...okResult, events: [] }));
    case "junk": return send(200, geminiReply("Sure! Here are your events: ..."));
    case "cut-off": return send(200, geminiReply('{"calendarName":"Test","events":[{"title":"Qu', "MAX_TOKENS"));
    case "blocked": return send(200, { candidates: [{ finishReason: "SAFETY" }] });
    case "bad-key": return send(403, { error: { code: 403, message: "API key not valid", status: "PERMISSION_DENIED" } });
    case "bad-request": return send(400, { error: { code: 400, message: "Unable to process input image", status: "INVALID_ARGUMENT" } });
    case "bad-dates": return send(200, geminiReply({ ...okResult, events: [{ ...goodEvent, start: "sometime" }, { ...goodEvent, start: "2027-02-30" }] }));
    case "some-bad-dates": return send(200, geminiReply({
      ...okResult,
      timeZone: "PST", // not a real IANA name -> should become America/Los_Angeles
      events: [
        goodEvent,
        { ...goodEvent, start: "2027-02-30", end: "2027-02-30" }, // no such day -> dropped
        { ...goodEvent, allDay: false, start: "2027-01-08T18:00", end: "2027-01-08T17:00" }, // end before start -> start + 1 h
      ],
    }));
    default: return send(500, { error: { message: `unknown scenario ${scenario}` } });
  }
}

const fakeGemini = createServer((req: IncomingMessage, res: ServerResponse) => {
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", () => {
    const model = req.url?.match(/models\/([^:]+):/)?.[1] ?? "?";
    const scenario = body.match(/SCENARIO:([\w-]+)/)?.[1] ?? "?";
    (calls[scenario] ??= []).push(model);
    answer(scenario, model, res);
  });
});
await new Promise<void>((resolve) => fakeGemini.listen(0, "127.0.0.1", resolve));
const fakePort = (fakeGemini.address() as AddressInfo).port;

// ---------- 2. our proxy, pointed at the fake ----------

const proxyLog: string[] = [];
const proxy = spawn(process.execPath, ["--import", "tsx", "src/server.ts"], {
  cwd: new URL("..", import.meta.url).pathname,
  env: {
    ...process.env,
    PORT: String(PROXY_PORT),
    GEMINI_API_KEY: "fake-key",
    GEMINI_BASE_URL: `http://127.0.0.1:${fakePort}`,
    GEMINI_MODEL: "fake-main",
    GEMINI_BACKUP_MODEL: "fake-backup",
    PARSE_TIMEOUT_MS: String(TIMEOUT_MS),
  },
});
proxy.stdout.on("data", (d) => proxyLog.push(String(d)));
proxy.stderr.on("data", (d) => proxyLog.push(String(d)));

async function waitForProxy() {
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(`${PROXY}/health`)).ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  console.log("Proxy did not start. Its output:\n" + proxyLog.join(""));
  process.exit(1);
}
await waitForProxy();

// ---------- 3. the tests ----------

type Test = {
  scenario: string;
  what: string;
  status: number;
  code?: AppError["code"];
  models?: string[]; // which models should have been called, in order
  check?: (r: ParseResult) => string | null; // extra check on a successful result
};

const M = "fake-main";
const B = "fake-backup";
const tests: Test[] = [
  { scenario: "ok", what: "normal answer", status: 200, models: [M] },
  { scenario: "busy-once", what: "503 once, then OK -> retried", status: 200, models: [M, M] },
  { scenario: "busy-main", what: "main model stays busy -> backup model", status: 200, models: [M, M, B] },
  { scenario: "busy-all", what: "both models busy -> RATE_LIMIT", status: 429, code: "RATE_LIMIT", models: [M, M, B, B] },
  { scenario: "ratelimit-main", what: "429 on main -> backup right away", status: 200, models: [M, B] },
  { scenario: "ratelimit-all", what: "429 on both -> RATE_LIMIT", status: 429, code: "RATE_LIMIT", models: [M, B] },
  { scenario: "never-answers", what: `no answer in ${TIMEOUT_MS / 1000} s -> TIMEOUT`, status: 504, code: "TIMEOUT", models: [M] },
  { scenario: "no-events", what: "zero events -> NO_DATES", status: 422, code: "NO_DATES" },
  { scenario: "junk", what: "not JSON -> PARSE_FAILED", status: 502, code: "PARSE_FAILED", models: [M] },
  { scenario: "cut-off", what: "answer too long, cut off -> PARSE_FAILED", status: 502, code: "PARSE_FAILED", models: [M] },
  { scenario: "blocked", what: "safety-blocked, no text -> PARSE_FAILED", status: 502, code: "PARSE_FAILED", models: [M] },
  { scenario: "bad-key", what: "403 bad key -> PARSE_FAILED, no retry", status: 502, code: "PARSE_FAILED", models: [M] },
  { scenario: "bad-request", what: "400 bad input -> PARSE_FAILED, no retry", status: 502, code: "PARSE_FAILED", models: [M] },
  { scenario: "bad-dates", what: "every date unusable -> PARSE_FAILED", status: 502, code: "PARSE_FAILED" },
  {
    scenario: "some-bad-dates",
    what: "bad date dropped, bad end fixed, bad time zone fixed",
    status: 200,
    check: (r) => {
      if (r.events.length !== 2) return `expected 2 events, got ${r.events.length}`;
      if (r.events[1].end !== "2027-01-08T19:00:00") return `end should be fixed to 19:00, got ${r.events[1].end}`;
      if (r.timeZone !== "America/Los_Angeles") return `timeZone should be America/Los_Angeles, got ${r.timeZone}`;
      return null;
    },
  },
];

let passed = 0;
for (const t of tests) {
  const started = Date.now();
  const res = await fetch(`${PROXY}/parse`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind: "text", text: `SCENARIO:${t.scenario}` }),
  });
  const body = await res.json();
  const secs = ((Date.now() - started) / 1000).toFixed(1);

  const problems: string[] = [];
  if (res.status !== t.status) problems.push(`HTTP ${res.status}, expected ${t.status}`);
  if (t.code && body.code !== t.code) problems.push(`code ${body.code}, expected ${t.code}`);
  if (t.models && (calls[t.scenario] ?? []).join(",") !== t.models.join(",")) {
    problems.push(`called [${calls[t.scenario]?.join(", ")}], expected [${t.models.join(", ")}]`);
  }
  if (t.check && res.ok) {
    const p = t.check(body as ParseResult);
    if (p) problems.push(p);
  }
  if (t.scenario === "never-answers" && Number(secs) > TIMEOUT_MS / 1000 + 1) problems.push(`took ${secs} s`);

  if (problems.length === 0) passed++;
  const shown = res.ok ? `${(body as ParseResult).events.length} events` : `${body.code}: "${body.message}"`;
  console.log(`${problems.length ? "FAIL" : "PASS"}  ${t.what}  (${secs} s)  -> ${shown}`);
  for (const p of problems) console.log(`      ✗ ${p}`);
}

console.log(`\n${passed}/${tests.length} cases passed.`);
if (passed < tests.length) console.log("\nProxy log:\n" + proxyLog.join(""));

proxy.kill();
fakeGemini.closeAllConnections();
fakeGemini.close();
process.exit(passed === tests.length ? 0 : 1);
