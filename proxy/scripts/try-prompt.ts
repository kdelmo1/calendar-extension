// Runs the small tricky inputs in fixtures/inputs/prompt-cases.json and checks
// each prompt rule (year guessing, time zones, ranges, holidays, confidence...).
//
// Usage (server must be running in another terminal with `npm run dev`):
//   npm run try:prompt

import { readFileSync } from "node:fs";
import type { AppError, CalendarEvent, ParseResult } from "../src/types.js";
import { fits, recurrenceProblem, type ExpectedRecurrence } from "./real-check.js";

const SERVER = process.env.PROXY_URL || "http://localhost:8080";

// start/end: Gemini's start/end must BEGIN WITH these ("T13:00" = time only, any date).
type ExpectedEvent = {
  start: string;
  end: string;
  category?: CalendarEvent["category"];
  allDay?: boolean;
  conf?: string; // ">=0.85" or "<0.7"
  sourceIncludes?: string;
  recurrence?: ExpectedRecurrence; // leave out = the event must NOT repeat
};
type Case = {
  name: string;
  rule: string;
  text: string;
  count?: number;
  timeZone?: string;
  error?: AppError["code"];
  events?: ExpectedEvent[];
};

const file = new URL("../../fixtures/inputs/prompt-cases.json", import.meta.url);
const { cases } = JSON.parse(readFileSync(file, "utf8")) as { cases: Case[] };

// Returns a list of problems (empty list = the case passed).
function check(c: Case, status: number, body: ParseResult | AppError): string[] {
  if (c.error) {
    const code = (body as AppError).code;
    return status >= 400 && code === c.error ? [] : [`expected error ${c.error}, got HTTP ${status} ${code ?? ""}`];
  }
  if (status !== 200) return [`HTTP ${status} ${JSON.stringify(body)}`];

  const result = body as ParseResult;
  const problems: string[] = [];
  if (c.timeZone && result.timeZone !== c.timeZone) problems.push(`timeZone ${result.timeZone}, expected ${c.timeZone}`);
  if (c.count !== undefined && result.events.length !== c.count) {
    problems.push(`${result.events.length} events, expected ${c.count}`);
  }

  for (const want of c.events ?? []) {
    const got = result.events.find((e) => fits(e.start, want.start) && fits(e.end, want.end));
    const label = `${want.start}..${want.end}`;
    if (!got) {
      problems.push(`missing ${label}`);
      continue;
    }
    if (want.category && got.category !== want.category) problems.push(`${label} category ${got.category}, expected ${want.category}`);
    if (want.allDay !== undefined && got.allDay !== want.allDay) problems.push(`${label} allDay ${got.allDay}, expected ${want.allDay}`);
    if (want.conf) {
      const [, op, num] = want.conf.match(/^(>=|<)([\d.]+)$/)!;
      const ok = op === ">=" ? got.confidence >= Number(num) : got.confidence < Number(num);
      if (!ok) problems.push(`${label} confidence ${got.confidence}, expected ${want.conf}`);
    }
    if (want.sourceIncludes && !got.sourceText.includes(want.sourceIncludes)) {
      problems.push(`${label} sourceText "${got.sourceText}" should include "${want.sourceIncludes}"`);
    }
    const rr = recurrenceProblem(got, want.recurrence);
    if (rr) problems.push(rr);
  }
  return problems;
}

// A short pause between cases keeps us under the free tier's 15 requests per minute.
const PAUSE_MS = 3500;

let passed = 0;
for (const [index, c] of cases.entries()) {
  if (index > 0) await new Promise((r) => setTimeout(r, PAUSE_MS));
  const started = Date.now();
  const res = await fetch(`${SERVER}/parse`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind: "text", text: c.text }),
  });
  const body = await res.json();
  const secs = ((Date.now() - started) / 1000).toFixed(1);
  const problems = check(c, res.status, body);
  if (problems.length === 0) passed++;

  console.log(`\n${problems.length ? "FAIL" : "PASS"}  ${c.name}  (${c.rule}, ${secs} s)`);
  if (res.ok) {
    const r = body as ParseResult;
    for (const e of r.events) {
      console.log(`      ${e.start} .. ${e.end}  [${e.category}] conf ${e.confidence}  ${e.title}  | "${e.sourceText}"${e.recurrence ? `  ↻ ${e.recurrence}` : ""}`);
    }
    if (r.timeZone !== "America/Los_Angeles") console.log(`      timeZone: ${r.timeZone}`);
  }
  for (const p of problems) console.log(`      ✗ ${p}`);
}

console.log(`\n${passed}/${cases.length} cases passed.`);
