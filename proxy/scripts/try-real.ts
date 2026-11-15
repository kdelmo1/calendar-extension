// Task 9: runs the REAL test inputs in fixtures/real/ and checks them against
// fixtures/real/answers.json. Tells you which inputs "need no fixes" and, for the
// others, exactly what's wrong. Also writes a report to proxy/out/real-report.md.
//
// Usage (server must be running: `npm run dev`, or set PROXY_URL to the Cloud Run URL):
//   npm run try:real                    all inputs
//   npm run try:real -- syllabus-cse30  just one (by name)
//
// Inputs run one at a time with a short pause, to stay under the free-tier rate limit.

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import type { AppError, CalendarEvent, ParseResult } from "../src/types.js";
import { buildCapture, checkResult, loadInputs, realDir, short } from "./real-check.js";

const SERVER = process.env.PROXY_URL || "http://localhost:8080";
const PAUSE_MS = 4000;

const inputs = loadInputs();
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

  let events: CalendarEvent[] = [];
  let problems: string[];
  if (!res.ok) {
    problems = [`server error ${(body as AppError).code}: ${(body as AppError).message}`];
  } else {
    events = (body as ParseResult).events;
    problems = checkResult(input, body as ParseResult);
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
    report.push(`- ${short(e)} [${e.category}] ${e.title}${e.allDay ? "" : " (timed)"}${e.recurrence ? ` ↻ ${e.recurrence}` : ""}${e.confidence < 0.7 ? ` ⚠️ ${e.confidence}` : ""}`);
  }
  report.push(``, `</details>`, ``);
}

const summary = `${clean}/${selected.length} inputs need no fixes.`;
console.log(`\n${summary}`);
report.splice(3, 0, `**${summary}**`, ``);
mkdirSync(new URL("../out/", import.meta.url), { recursive: true });
writeFileSync(new URL("../out/real-report.md", import.meta.url), report.join("\n"));
console.log("Report saved to proxy/out/real-report.md");
