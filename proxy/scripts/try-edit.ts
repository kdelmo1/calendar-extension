// Tests plain-English edits (POST /edit) with REAL Gemini function calling.
// Starts from fixtures/ucsc-winter.json (18 events) and, for a bulk edit, the 153-event
// UCSC demo backup. Each case checks the result in code.
//
// Usage (server must be running: `npm run dev`, or set PROXY_URL to the Cloud Run URL):
//   npm run try:edit

import { readFileSync } from "node:fs";
import type { AppError, CalendarEvent, ParseResult } from "../src/types.js";

const SERVER = process.env.PROXY_URL || "http://localhost:8080";
const PAUSE_MS = 4000;

const fixture: ParseResult = JSON.parse(readFileSync(new URL("../../fixtures/ucsc-winter.json", import.meta.url), "utf8"));
const big: ParseResult = JSON.parse(
  readFileSync(new URL("../../extension/parse/backups/ucsc-key-dates.json", import.meta.url), "utf8"),
).result;

type Answer = { result: ParseResult; summary: string };
type Case = { instruction: string; start: ParseResult; check: (a: Answer, before: CalendarEvent[]) => string | null };

const find = (events: CalendarEvent[], titlePart: string) =>
  events.find((e) => e.title.toLowerCase().includes(titlePart.toLowerCase()));
// Every event except `changed` must be exactly as before.
const othersUnchanged = (after: CalendarEvent[], before: CalendarEvent[], changed: string[]) => {
  const touched = before.filter((b) => {
    if (changed.includes(b.id)) return false;
    const a = after.find((x) => x.id === b.id);
    return !a || a.start !== b.start || a.end !== b.end || a.title !== b.title || a.category !== b.category;
  });
  return touched.length ? `also changed or removed: ${touched.map((t) => t.title).join(", ")}` : null;
};

const cases: Case[] = [
  {
    instruction: "Move the final exams to March 16 to 20",
    start: fixture,
    check: ({ result }, before) => {
      const finals = find(result.events, "final exam");
      if (finals?.start !== "2027-03-16" || finals.end !== "2027-03-20") return `finals: ${finals?.start}..${finals?.end}`;
      return othersUnchanged(result.events, before, [finals.id]);
    },
  },
  {
    instruction: "Delete all the holidays",
    start: fixture,
    check: ({ result }, before) => {
      if (result.events.some((e) => e.category === "holiday")) return "a holiday is still there";
      if (result.events.length !== 14) return `expected 14 events left, got ${result.events.length}`;
      return othersUnchanged(result.events, before, before.filter((e) => e.category === "holiday").map((e) => e.id));
    },
  },
  {
    instruction: "Add a study group every Thursday 7–9 PM from Jan 7 to Mar 11 at McHenry Library",
    start: fixture,
    check: ({ result }, before) => {
      const added = result.events.find((e) => !before.some((b) => b.id === e.id));
      if (result.events.length !== 19 || !added) return `expected 1 new event, got ${result.events.length - before.length}`;
      if (added.start !== "2027-01-07T19:00:00" || added.end !== "2027-01-07T21:00:00") return `times: ${added.start}..${added.end}`;
      if (!added.recurrence?.includes("BYDAY=TH") || !added.recurrence.includes("UNTIL=202703")) return `rule: ${added.recurrence}`;
      if (!added.location?.includes("McHenry")) return `location: ${added.location}`;
      return othersUnchanged(result.events, before, []);
    },
  },
  {
    instruction: "Grades are due at 5 PM, not all day",
    start: fixture,
    check: ({ result }, before) => {
      const grades = find(result.events, "grades due");
      if (grades?.allDay !== false || !grades.start.startsWith("2027-03-23T17:00")) return `grades: ${grades?.start} allDay ${grades?.allDay}`;
      return othersUnchanged(result.events, before, [grades.id]);
    },
  },
  {
    instruction: "Remove everything before February",
    start: fixture,
    check: ({ result }) => {
      if (result.events.some((e) => e.start < "2027-02-01")) return `still has: ${result.events.filter((e) => e.start < "2027-02-01").map((e) => e.title).join(", ")}`;
      return result.events.length === 13 ? null : `expected 13 events left, got ${result.events.length}`;
    },
  },
  {
    instruction: "What's the weather tomorrow?",
    start: fixture,
    check: ({ result, summary }, before) =>
      result.events.length === before.length && summary.trim() ? othersUnchanged(result.events, before, []) : `changed something: "${summary}"`,
  },
  {
    instruction: "Rename Instruction Ends to Last Day of Classes",
    start: fixture,
    check: ({ result }, before) => {
      const renamed = result.events.find((e) => e.start === "2027-03-12");
      if (renamed?.title !== "Last Day of Classes") return `title: ${renamed?.title}`;
      return othersUnchanged(result.events, before, [renamed.id]);
    },
  },
  {
    // (An earlier wording, "I only care about the winter quarter: delete everything outside Jan 1 - Mar 31",
    // mixed two ideas; Gemini reasonably also deleted Spring 2027 deadlines dated in March.)
    instruction: "Delete every event that starts before January 1, 2027 or after March 31, 2027",
    start: big,
    check: ({ result }, before) => {
      const outside = result.events.filter((e) => e.end < "2027-01-01" || e.start > "2027-03-31");
      if (outside.length) return `${outside.length} events outside Jan-Mar left, e.g. ${outside[0].title} ${outside[0].start}`;
      const inside = before.filter((e) => e.start >= "2027-01-01" && e.start <= "2027-03-31");
      const lost = inside.filter((b) => !result.events.some((a) => a.id === b.id));
      return lost.length ? `${lost.length} winter events deleted by mistake, e.g. ${lost[0].title} ${lost[0].start}` : null;
    },
  },
];

let passed = 0;
for (const [index, c] of cases.entries()) {
  if (index > 0) await new Promise((r) => setTimeout(r, PAUSE_MS));
  const started = Date.now();
  const res = await fetch(`${SERVER}/edit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ events: c.start.events, instruction: c.instruction, calendarName: c.start.calendarName, timeZone: c.start.timeZone }),
  });
  const body = (await res.json()) as Answer | AppError;
  const secs = ((Date.now() - started) / 1000).toFixed(1);
  const problem = res.ok ? c.check(body as Answer, c.start.events) : `HTTP ${res.status} ${JSON.stringify(body)}`;
  if (!problem) passed++;
  console.log(`\n${problem ? "FAIL" : "PASS"}  "${c.instruction}"  (${c.start.events.length} events, ${secs} s)`);
  if (res.ok) console.log(`      summary: ${(body as Answer).summary}`);
  if (problem) console.log(`      ✗ ${problem}`);
}
console.log(`\n${passed}/${cases.length} cases passed.`);
