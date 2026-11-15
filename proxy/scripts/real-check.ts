// Shared by try-real.ts and save-demo-backups.ts: loads the real test inputs and their
// answer keys (fixtures/real/answers.json) and checks a ParseResult against a key.

import { readFileSync } from "node:fs";
import type { CalendarEvent, CaptureInput, ParseResult } from "../src/types.js";

export const realDir = new URL("../../fixtures/real/", import.meta.url);

// start/end: an event matches if its start/end BEGIN WITH these strings.
// A value starting with "T" (like "T17:30") checks only the time, so any date is OK.
// end is optional: leave it out to not check the end.
// optional: fine if Gemini adds it (it won't count as an extra), but not required.
export type Expected = {
  start: string;
  end?: string;
  category?: CalendarEvent["category"];
  allDay?: boolean;
  title?: string;
  optional?: boolean;
};

export type RealInput = {
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

export function loadInputs(): RealInput[] {
  return (JSON.parse(readFileSync(new URL("answers.json", realDir), "utf8")) as { inputs: RealInput[] }).inputs;
}

// The CaptureInput Lane 1 would send for this test input.
export function buildCapture(input: RealInput): CaptureInput {
  const bytes = readFileSync(new URL(input.file, realDir));
  const base = { pageTitle: input.pageTitle, pageUrl: input.pageUrl };
  if (input.kind === "text") return { kind: "text", text: bytes.toString("utf8"), ...base };
  return { kind: input.kind, fileBase64: bytes.toString("base64"), mimeType: input.mimeType, ...base };
}

export const short = (e: { start: string; end?: string }) =>
  e.end && e.end !== e.start ? `${e.start} → ${e.end}` : e.start;

// Does Gemini's date/time `got` match the expected `want` (see Expected above)?
const fits = (got: string, want: string) => (want.startsWith("T") ? got.slice(10) : got).startsWith(want);

// Returns everything wrong with `result` compared to the answer key. Empty list = "needs no fixes".
export function checkResult(input: RealInput, result: ParseResult): string[] {
  const problems: string[] = [];
  const events = result.events;
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
  return problems;
}
