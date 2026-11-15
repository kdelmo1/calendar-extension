// Task 9: runs the REAL test inputs in fixtures/real/ and checks them against
// fixtures/real/answers.json. Tells you which inputs "need no fixes" and, for the
// others, exactly what's wrong. Also writes a report to proxy/out/real-report.md.
//
// Usage (server must be running: `npm run dev`, or set PROXY_URL to the Cloud Run URL):
//   npm run try:real                    all inputs
//   npm run try:real -- syllabus-cse30  just one (by name)
//
// Inputs run one at a time with a short pause, to stay under the free-tier rate limit.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import type { AppError, CalendarEvent, CaptureInput, ParseResult } from "../src/types.js";

const SERVER = process.env.PROXY_URL || "http://localhost:8080";
const PAUSE_MS = 4000;
const realDir = new URL("../../fixtures/real/", import.meta.url);

// start/end: an event matches if its start/end BEGIN WITH these strings.
// A value starting with "T" (like "T17:30") checks only the time, so any date is OK.
// end is optional: leave it out to not check the end.
// optional: fine if Gemini adds it (it won't count as an extra), but not required.
type Expected = {
  start: string;
  end?: string;
  category?: CalendarEvent["category"];
  allDay?: boolean;
  title?: string;
  optional?: boolean;
};
type RealInput = {
  name: string;
  about: string;
  file: string;
  kind: CaptureInput["kind"];
  mimeType?: string;
  pageTitle?: string;
  pageUrl?: string;
  timeZone?: string; // expected ParseResult.timeZone
  allowExtras?: boolean; // any extra events are OK
  okExtras?: string[]; // extra events are OK if their title or sourceText contains one of these
  allFlagged?: boolean; // every event must be flagged for review (confidence < 0.7)
  events: Expected[];
};

// Does Gemini's date/time `got` match the expected `want` (see Expected above)?
const fits = (got: string, want: string) => (want.startsWith("T") ? got.slice(10) : got).startsWith(want);

const { inputs } = JSON.parse(readFileSync(new URL("answers.json", realDir), "utf8")) as { inputs: RealInput[] };
const only = process.argv[2];
// private-* files are not on GitHub, so teammates won't have them: skip those instead of crashing.
const missing = inputs.filter((i) => !existsSync(new URL(i.file, realDir)));
for (const i of missing) console.log(`SKIPPED  ${i.name}  (${i.file} is not on this computer)`);
const available = inputs.filter((i) => !missing.includes(i));
const selected = only ? available.filter((i) => i.name === only) : available;
if (selected.length === 0) {
  console.log(`No input named "${only}". Names: ${inputs.map((i) => i.name).join(", ")}`);
  process.exit(1);
}

function buildCapture(input: RealInput): CaptureInput {
  const bytes = readFileSync(new URL(input.file, realDir));
  const base = { pageTitle: input.pageTitle, pageUrl: input.pageUrl };
  if (input.kind === "text") return { kind: "text", text: bytes.toString("utf8"), ...base };
  return { kind: input.kind, fileBase64: bytes.toString("base64"), mimeType: input.mimeType, ...base };
}

const short = (e: { start: string; end?: string }) => (e.end && e.end !== e.start ? `${e.start} → ${e.end}` : e.start);

const report: string[] = [`# Real-input report`, ``, `Run: ${new Date().toISOString()}  |  Server: ${SERVER}`, ``];
let clean = 0;

for (const [index, input] of selected.entries()) {
  if (index > 0) await new Promise((r) => setTimeout(r, PAUSE_MS));

  const started = Date.now();
  const res = await fetch(`${SERVER}/parse`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildCapture(input)),
  });
  const body = (await res.json()) as ParseResult | AppError;
  const secs = ((Date.now() - started) / 1000).toFixed(1);

  const problems: string[] = [];
  let events: CalendarEvent[] = [];
  if (!res.ok) {
    problems.push(`server error ${(body as AppError).code}: ${(body as AppError).message}`);
  } else {
    const result = body as ParseResult;
    events = result.events;
    const used = new Set<CalendarEvent>();

    if (input.timeZone && result.timeZone !== input.timeZone) {
      problems.push(`timeZone: got ${result.timeZone}, expected ${input.timeZone}`);
    }

    // Several events can share a date (e.g. "Office hours cancelled" and "Midterm" on 10/27),
    // so among the events that fit, pick the best one: same category first, then most similar title.
    const words = (s: string) => new Set(s.toLowerCase().match(/[a-z0-9]+/g) ?? []);
    const similarity = (a: string, b: string) => [...words(a)].filter((w) => words(b).has(w)).length;
    const score = (e: CalendarEvent, want: Expected) =>
      (want.category && e.category === want.category ? 100 : 0) + similarity(e.title, want.title ?? "");

    for (const want of input.events) {
      const candidates = events.filter((e) => !used.has(e) && fits(e.start, want.start) && (!want.end || fits(e.end, want.end)));
      const got = candidates.sort((a, b) => score(b, want) - score(a, want))[0];
      if (!got && want.optional) continue;
      if (!got) {
        // Same start but different end? Say so, it's a more useful message.
        const near = events.find((e) => !used.has(e) && fits(e.start, want.start));
        problems.push(near
          ? `wrong end for ${want.title ?? short(want)}: got ${short(near)} "${near.title}"`
          : `missing ${short(want)}${want.title ? ` (${want.title})` : ""}`);
        continue;
      }
      used.add(got);
      if (want.category && got.category !== want.category) {
        problems.push(`category for "${got.title}" (${short(got)}): got ${got.category}, expected ${want.category}`);
      }
      if (want.allDay !== undefined && got.allDay !== want.allDay) {
        problems.push(`allDay for "${got.title}": got ${got.allDay}, expected ${want.allDay}`);
      }
    }
    if (!input.allowExtras) {
      const okExtra = (e: CalendarEvent) =>
        (input.okExtras ?? []).some((s) => `${e.title} ${e.sourceText}`.toLowerCase().includes(s.toLowerCase()));
      for (const extra of events.filter((e) => !used.has(e) && !okExtra(e))) {
        problems.push(`extra event: ${short(extra)} "${extra.title}" | source: "${extra.sourceText.replace(/\s+/g, " ").slice(0, 80)}"`);
      }
    }
    if (input.allFlagged) {
      const notFlagged = events.filter((e) => e.confidence >= 0.7);
      if (notFlagged.length) {
        problems.push(`${notFlagged.length} events not flagged for review (the input has no date), e.g. "${notFlagged[0].title}" ${notFlagged[0].confidence}`);
      }
    }
  }

  const ok = problems.length === 0;
  if (ok) clean++;
  const low = events.filter((e) => e.confidence < 0.7).length;
  console.log(`\n${ok ? "NO FIXES" : "NEEDS FIXES"}  ${input.name}  (${secs} s, ${events.length} events, ${low} flagged for review)`);
  console.log(`      ${input.about}`);
  for (const p of problems) console.log(`      ✗ ${p}`);

  report.push(`## ${ok ? "✅" : "❌"} ${input.name}`, ``, `${input.about} — ${secs} s, ${events.length} events, ${low} flagged`, ``);
  if (problems.length) report.push(...problems.map((p) => `- ${p}`), ``);
  report.push(`<details><summary>All events</summary>`, ``);
  for (const e of events) {
    report.push(`- ${short(e)} [${e.category}] ${e.title}${e.allDay ? "" : " (timed)"}${e.confidence < 0.7 ? ` ⚠️ ${e.confidence}` : ""}`);
  }
  report.push(``, `</details>`, ``);
}

const summary = `${clean}/${selected.length} inputs need no fixes.`;
console.log(`\n${summary}`);
report.splice(3, 0, `**${summary}**`, ``);
mkdirSync(new URL("../out/", import.meta.url), { recursive: true });
writeFileSync(new URL("../out/real-report.md", import.meta.url), report.join("\n"));
console.log("Report saved to proxy/out/real-report.md");
