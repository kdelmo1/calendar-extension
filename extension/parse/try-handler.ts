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

// 7-13. Demo backups (task 10): the 3 demo inputs fall back to saved results when the
// server can't answer; everything else still gets the error.
{
  const { readFileSync } = await import("node:fs");
  const real = (name: string) => readFileSync(new URL(`../../fixtures/real/${name}`, import.meta.url));
  const ucscText = readFileSync(new URL("../../fixtures/inputs/ucsc-key-dates.txt", import.meta.url), "utf8");
  const pdf = real("2026-2027-AcadAdmin-Calendar.pdf").toString("base64");
  const png = real("Forum(English).png").toString("base64");
  const otherPdf = readFileSync(new URL("../../fixtures/inputs/flyer.pdf", import.meta.url)).toString("base64");

  let fetchCalls = 0;
  const warnings: string[] = [];
  const realWarn = console.warn;
  console.warn = (...args: unknown[]) => warnings.push(args.join(" "));
  const unreachable: typeof fetch = async () => { fetchCalls++; throw new TypeError("Failed to fetch"); };

  async function run(name: string, payload: object, fakeFetch: typeof fetch | null, expect: (p: Record<string, unknown>) => string | null) {
    globalThis.fetch = fakeFetch ?? realFetch;
    sentMessages.length = 0;
    warnings.length = 0;
    fetchCalls = 0;
    await simulate({ type: "PARSE_REQUEST", payload });
    const p = sentMessages[0]?.payload as Record<string, unknown>;
    const events = (p?.events as unknown[] | undefined)?.length;
    report(name, expect(p), events !== undefined ? `${events} events${warnings[0] ? `, ${warnings[0]}` : ""}` : `${p?.code}`);
  }
  const hasEvents = (n: number) => (p: Record<string, unknown>) =>
    (p?.events as unknown[] | undefined)?.length === n && warnings.length === 1 ? null : `got ${JSON.stringify(p).slice(0, 120)}`;

  await run("demo PDF, server down -> saved result", { kind: "file", fileBase64: pdf, mimeType: "application/pdf" }, unreachable, hasEvents(36));
  await run("demo flyer upload, server down -> saved result", { kind: "file", fileBase64: png, mimeType: "image/png" }, unreachable, hasEvents(1));
  await run("demo flyer right-clicked, server down -> saved result", { kind: "image", imageUrl: "https://example.edu/img/Forum(English).png" }, unreachable, hasEvents(1));
  await run("demo UCSC text, server down -> saved result", { kind: "text", text: ucscText }, unreachable, hasEvents(153));
  await run("NOT a demo file, server down -> still PARSE_FAILED", { kind: "file", fileBase64: otherPdf, mimeType: "application/pdf" }, unreachable,
    (p) => (p?.code === "PARSE_FAILED" ? null : `got ${JSON.stringify(p).slice(0, 120)}`));
  await run("demo input, server says NO_DATES -> keeps NO_DATES", { kind: "file", fileBase64: png, mimeType: "image/png" },
    async () => new Response(JSON.stringify({ code: "NO_DATES", message: "none" }), { status: 422 }),
    (p) => (p?.code === "NO_DATES" ? null : `got ${JSON.stringify(p).slice(0, 120)}`));

  // Offline: use the backup straight away, without even trying the network.
  // (Newer Node versions have a read-only `navigator`, so replace it with defineProperty
  // and put the original back afterwards.)
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  Object.defineProperty(globalThis, "navigator", { value: { onLine: false }, configurable: true, writable: true });
  await run("demo PDF while offline -> saved result, no network call", { kind: "file", fileBase64: pdf, mimeType: "application/pdf" }, unreachable,
    (p) => ((p?.events as unknown[] | undefined)?.length === 36 && fetchCalls === 0 ? null : `events ${(p?.events as unknown[])?.length}, fetch calls ${fetchCalls}`));
  if (originalNavigator) Object.defineProperty(globalThis, "navigator", originalNavigator);
  else delete (globalThis as { navigator?: unknown }).navigator;

  // Online and the server works: the LIVE answer is used, not the backup.
  await run("demo flyer, server up -> live answer (no backup)", { kind: "file", fileBase64: png, mimeType: "image/png" }, null,
    (p) => ((p?.events as unknown[] | undefined)?.length === 1 && warnings.length === 0 ? null : `warnings: ${warnings.join("; ")}`));

  console.warn = realWarn;
  globalThis.fetch = realFetch;
}

// 15-17. EDIT_REQUEST -> EDIT_RESULT (fake server replies, so this works before /edit is deployed)
{
  const events = [{ id: "a", title: "Midterm", allDay: true, start: "2027-02-10", end: "2027-02-10", recurrence: null,
    location: null, description: null, category: "exam", confidence: 0.95, sourceText: "Midterm Feb 10" }];
  const editRequest = { type: "EDIT_REQUEST", payload: { events, instruction: "Move the midterm to Feb 12" } };
  const reply = (status: number, body: unknown): typeof fetch => async () => new Response(JSON.stringify(body), { status });
  const moved = { result: { calendarName: "Test", timeZone: "America/Los_Angeles", events: [{ ...events[0], start: "2027-02-12", end: "2027-02-12" }] },
    summary: 'Updated 1 event: "Midterm".' };
  const edits: [string, typeof fetch, (p: Record<string, unknown>) => string | null][] = [
    ["EDIT_REQUEST -> EDIT_RESULT with result + summary", reply(200, moved),
      (p) => ((p?.result as { events: { start: string }[] })?.events[0].start === "2027-02-12" && p.summary ? null : `got ${JSON.stringify(p)}`)],
    ["EDIT_REQUEST, server down -> PARSE_FAILED", async () => { throw new TypeError("Failed to fetch"); },
      (p) => (p?.code === "PARSE_FAILED" ? null : `got ${JSON.stringify(p)}`)],
    ["EDIT_REQUEST, odd reply -> PARSE_FAILED", reply(200, { hello: "world" }),
      (p) => (p?.code === "PARSE_FAILED" ? null : `got ${JSON.stringify(p)}`)],
  ];
  for (const [name, fakeFetch, expect] of edits) {
    globalThis.fetch = fakeFetch;
    sentMessages.length = 0;
    const { response } = await simulate(editRequest);
    const msg = sentMessages.find((m) => m.type === "EDIT_RESULT");
    const p = msg?.payload as Record<string, unknown>;
    report(name, !msg ? "no EDIT_RESULT sent" : response !== msg.payload ? "sendResponse got something different" : expect(p),
      (p?.summary as string) ?? (p?.code as string));
  }
  globalThis.fetch = realFetch;
}

console.log(`\n${passed}/${total} cases passed.`);
