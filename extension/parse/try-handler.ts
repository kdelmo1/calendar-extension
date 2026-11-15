// Tests the PARSE_REQUEST handler WITHOUT Chrome: a tiny fake `chrome` object records
// the messages we send, and real requests go to our deployed Cloud Run server.
//
// Usage (from the proxy/ folder, which has tsx installed):
//   npx tsx ../extension/parse/try-handler.ts
//
// This file is only for testing; the extension never imports it.

export {}; // makes this file a module (needed for top-level await)

type Listener = (message: unknown, sender: unknown, sendResponse: (r: unknown) => void) => boolean | void;

// ---------- fake chrome.runtime ----------
const listeners: Listener[] = [];
const sentMessages: { type: string; payload: unknown }[] = [];
(globalThis as unknown as { chrome: unknown }).chrome = {
  runtime: {
    onMessage: { addListener: (l: Listener) => listeners.push(l) },
    sendMessage: async (m: { type: string; payload: unknown }) => {
      sentMessages.push(m);
    },
  },
};

// Pretend another part of the extension sent `message`. Returns what came back.
function simulate(message: unknown): Promise<{ claimed: boolean; response?: unknown }> {
  return new Promise((resolve) => {
    const keepOpen = listeners[0](message, {}, (response) => resolve({ claimed: true, response }));
    if (keepOpen !== true) resolve({ claimed: false });
  });
}

// Load our handler AFTER the fake chrome exists (it registers its listener on import).
await import("./index");
const { PROXY_URL } = await import("./client");
console.log(`Server: ${PROXY_URL}\n`);

let passed = 0;
let total = 0;
function report(name: string, problem: string | null, detail = "") {
  total++;
  if (!problem) passed++;
  console.log(`${problem ? "FAIL" : "PASS"}  ${name}${detail ? `  -> ${detail}` : ""}`);
  if (problem) console.log(`      ✗ ${problem}`);
}

// 1. Real request through Cloud Run
{
  sentMessages.length = 0;
  const started = Date.now();
  const { response } = await simulate({
    type: "PARSE_REQUEST",
    payload: { kind: "text", text: "CSE 30 midterm: Feb 10, 2027. Spring break March 22 – 26, 2027." },
  });
  const secs = ((Date.now() - started) / 1000).toFixed(1);
  const msg = sentMessages.find((m) => m.type === "PARSE_RESULT");
  const result = msg?.payload as { events?: { start: string; end: string; title: string }[] } | undefined;
  const events = result?.events ?? [];
  const hasMidterm = events.some((e) => e.start === "2027-02-10");
  const hasBreak = events.some((e) => e.start === "2027-03-22" && e.end === "2027-03-26");
  report(
    "text -> PARSE_RESULT with events",
    !msg ? "no PARSE_RESULT sent" : !hasMidterm || !hasBreak ? `wrong events: ${JSON.stringify(result)}` :
      response !== msg.payload ? "sendResponse got something different" : null,
    `${secs} s, ${events.map((e) => `${e.start}..${e.end} ${e.title}`).join("; ")}`,
  );
}

// 2. Server's AppError is passed straight through
{
  sentMessages.length = 0;
  await simulate({ type: "PARSE_REQUEST", payload: { kind: "text", text: "   " } });
  const payload = sentMessages[0]?.payload as { code?: string; message?: string };
  report("empty capture -> AppError NO_DATES", payload?.code === "NO_DATES" ? null : `got ${JSON.stringify(payload)}`, payload?.message);
}

// 3. Messages that aren't ours are left for other listeners (e.g. Lane 1's GET_TOKEN)
{
  const { claimed } = await simulate({ type: "GET_TOKEN" });
  report("GET_TOKEN is ignored", claimed ? "our listener claimed it" : null);
}

// 4-6. Failures, by swapping in a fake fetch
const realFetch = globalThis.fetch;
const failures: [string, typeof fetch, string][] = [
  ["server unreachable -> PARSE_FAILED", async () => { throw new TypeError("Failed to fetch"); }, "PARSE_FAILED"],
  ["no answer in time -> TIMEOUT", async () => { throw new DOMException("timed out", "TimeoutError"); }, "TIMEOUT"],
  ["HTML error page -> PARSE_FAILED", async () => new Response("<html>503</html>", { status: 503 }), "PARSE_FAILED"],
];
for (const [name, fakeFetch, code] of failures) {
  globalThis.fetch = fakeFetch;
  sentMessages.length = 0;
  await simulate({ type: "PARSE_REQUEST", payload: { kind: "text", text: "x" } });
  const payload = sentMessages[0]?.payload as { code?: string; message?: string };
  report(name, payload?.code === code ? null : `got ${JSON.stringify(payload)}`, payload?.message);
}
globalThis.fetch = realFetch;

console.log(`\n${passed}/${total} cases passed.`);
