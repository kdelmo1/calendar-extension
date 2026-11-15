// Turns a CaptureInput into a ParseResult using Gemini.

import { randomUUID } from "node:crypto";
import { chunkText, mergeAnswers, planChunks } from "./chunks.js";
import { AppErrorException } from "./errors.js";
import { askGemini, type GeminiPart } from "./gemini.js";
import { buildParts } from "./inputs.js";
import { fixRecurrence } from "./recurrence.js";
import { buildSchema } from "./schema.js";
import { buildSystemPrompt } from "./prompt.js";
import type { CalendarEvent, CaptureInput, Category, ParseResult } from "./types.js";

export const DEFAULT_TIME_ZONE = "America/Los_Angeles";
export const CATEGORIES: Category[] = ["deadline", "holiday", "exam", "class", "event"];

// One event the way Gemini writes it (see schema.ts), before we tidy it up.
export type GeminiEvent = Partial<CalendarEvent> & { lines?: number[]; yearSource?: string; unsure?: boolean };

export async function parseCapture(input: CaptureInput): Promise<ParseResult> {
  // text, file or image -> Gemini message (see inputs.ts). `lines` is set for text inputs.
  const { parts, lines, intro } = await buildParts(input);
  const useLines = lines !== null;
  const prompt = buildSystemPrompt(todayIn(DEFAULT_TIME_ZONE), useLines);
  const schema = buildSchema(useLines);

  // Big text inputs are split into a few pieces that Gemini reads at the same time
  // (see chunks.ts). Everything else is one call.
  const chunks = lines ? planChunks(lines) : [];
  let raw: unknown;
  if (lines && chunks.length > 1) {
    console.log(`Splitting ${lines.length} lines into ${chunks.length} parallel parts: ` +
      chunks.map((c) => `L${c.from}-L${c.to}`).join(", "));
    // Promise.all = run them all at once and wait for every one (like asyncio.gather).
    // If any part fails, the whole parse fails with that part's AppError.
    const answers = await Promise.all(
      chunks.map((chunk) => askGemini(prompt, [{ text: chunkText(intro, lines, chunk) }], schema)),
    );
    raw = mergeAnswers(answers, chunks);
  } else {
    raw = await askGemini(prompt, parts, schema);
  }

  return cleanUp(raw, yearIsMissing(parts), lines);
}

// True if the input is all text and has no year anywhere (like "Bake sale March 3").
// Then every year Gemini gives is a guess, whatever it says. We can't check this for
// PDFs and images because we can't read them ourselves.
function yearIsMissing(parts: GeminiPart[]): boolean {
  if (!parts.every((p) => "text" in p)) return false;
  const allText = parts.map((p) => ("text" in p ? p.text : "")).join("\n");
  return !/\b(19|20)\d{2}\b|'\d{2}\b/.test(allText); // e.g. 2027, 1999, '27
}

// Does this text contain a calendar date? ("Jan 5", "March 11, 2027", "09/24/26", "2027-01-05")
function hasDate(text: string): boolean {
  return /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2}\b|\b\d{1,2}\/\d{1,2}\b|\b\d{4}-\d{2}-\d{2}\b/i.test(text);
}

// Checks Gemini's answer, fills in safe defaults, and adds an id to every event.
function cleanUp(raw: unknown, yearMissing: boolean, lines: string[] | null): ParseResult {
  const r = raw as (Omit<Partial<ParseResult>, "events"> & { events?: GeminiEvent[] }) | null;
  if (!r || !Array.isArray(r.events)) {
    throw new AppErrorException("PARSE_FAILED", "Gemini's answer was missing the event list.", 502);
  }

  if (r.events.length === 0) {
    throw new AppErrorException("NO_DATES", "We couldn't find any dates in what you selected.", 422);
  }

  const timeZone = isRealTimeZone(r.timeZone) ? r.timeZone!.trim() : DEFAULT_TIME_ZONE;

  const events: CalendarEvent[] = [];
  for (const e of r.events) {
    const times = fixTimes(e);
    if (!times) {
      // A date we can't use (e.g. "sometime", "2027-02-30"): skip this event, keep the rest.
      console.warn("Skipping event with unusable date:", JSON.stringify(e).slice(0, 200));
      continue;
    }
    // Repeating events: check the RRULE and move the first meeting onto one of its days (recurrence.ts).
    const { rule, ...fixedTimes } = fixRecurrence(e.recurrence, times, timeZone);
    const sourceText = sourceTextFor(e, lines);
    // A repeating event whose original text has no date ("Tuesdays 5:20 PM") has guessed start/end
    // dates, whatever Gemini says, so it must be flagged for review.
    const guessed = yearMissing || (rule !== null && !hasDate(sourceText));
    events.push({
      id: randomUUID(),
      title: String(e.title || "Untitled event"),
      ...fixedTimes,
      recurrence: rule,
      location: e.location || null,
      description: e.description || null,
      category: CATEGORIES.includes(e.category as Category) ? (e.category as Category) : "event",
      confidence: honestConfidence(guessed ? { ...e, yearSource: "guessed" } : e),
      sourceText,
    });
  }

  if (events.length === 0) {
    // Gemini found "events" but none had a usable date: its answer is unusable.
    throw new AppErrorException("PARSE_FAILED", "We found dates but couldn't understand them. Please try again.", 502);
  }

  return {
    calendarName: r.calendarName?.trim() || "Imported dates",
    timeZone,
    events: dropRepeatsCoveredByDatedRows(events),
  };
}

// A syllabus can say "Lectures T/TH 9:50-11:25" AND list every lecture by date. Then a repeating
// "Lecture" event would double every lecture in the calendar. (This happens when a big input is split
// into parts: the part with "T/TH 9:50" can't see the dated schedule in another part.)
// So: if a repeating class event shares its weekdays with 3+ dated class events, drop it and give its
// time to those dated rows that have no time yet.
function dropRepeatsCoveredByDatedRows(events: CalendarEvent[]): CalendarEvent[] {
  const DAY_CODES = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
  const dayCode = (date: string) => DAY_CODES[new Date(`${date.slice(0, 10)}T12:00:00Z`).getUTCDay()];

  const dropped = new Set<CalendarEvent>();
  for (const repeat of events) {
    const days = repeat.recurrence?.match(/BYDAY=([^;]+)/)?.[1].split(",").map((d) => d.slice(-2));
    if (repeat.category !== "class" || !days) continue;
    const datedRows = events.filter((e) => e !== repeat && !e.recurrence && e.category === "class" && days.includes(dayCode(e.start)));
    if (datedRows.length < 3) continue;

    dropped.add(repeat);
    console.log(`Dropping repeating "${repeat.title}": ${datedRows.length} dated class rows already cover it`);
    if (!repeat.allDay) {
      for (const row of datedRows.filter((e) => e.allDay)) {
        row.allDay = false;
        row.start = `${row.start.slice(0, 10)}${repeat.start.slice(10)}`;
        row.end = `${row.start.slice(0, 10)}${repeat.end.slice(10)}`;
      }
    }
  }
  return events.filter((e) => !dropped.has(e));
}

// The original snippet for an event. For text inputs Gemini gives line numbers
// (to keep its answer short) and we copy those lines ourselves, so it's always exact.
// For PDFs and images Gemini copies the text itself.
function sourceTextFor(e: GeminiEvent, lines: string[] | null): string {
  if (e.sourceText) return String(e.sourceText);
  if (!lines || !Array.isArray(e.lines)) return "";
  const picked = [...new Set(e.lines)]
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= lines.length)
    .sort((a, b) => a - b)
    .slice(0, 5) // a few lines at most
    .map((n) => lines[n - 1].trim())
    .filter(Boolean);
  return picked.join("\n");
}

// Checks and tidies one event's dates. Returns null if the start date is unusable.
//   all-day: "YYYY-MM-DD"            timed: "YYYY-MM-DDTHH:MM:SS" (local time, no offset)
// Rules: a bad or too-early end becomes the start (all-day) or start + 1 hour (timed).
export function fixTimes(e: GeminiEvent): Pick<CalendarEvent, "allDay" | "start" | "end"> | null {
  const start = String(e.start ?? "").trim();
  const end = String(e.end ?? "").trim();
  const startDate = start.slice(0, 10);
  if (!isRealDate(startDate)) return null;

  const startTime = toLocalDateTime(start);
  // All-day if Gemini says so, or if there's no usable time on the start.
  if (e.allDay || !startTime) {
    const endDate = end.slice(0, 10);
    return { allDay: true, start: startDate, end: isRealDate(endDate) && endDate >= startDate ? endDate : startDate };
  }

  const endTime = toLocalDateTime(end);
  return { allDay: false, start: startTime, end: endTime && endTime > startTime ? endTime : addOneHour(startTime) };
}

// "2027-02-30" is not a real date even though it looks like one.
function isRealDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

// "2027-01-08T18:00", "2027-01-08T18:00:00Z" or "...-08:00" -> "2027-01-08T18:00:00". null if no time.
function toLocalDateTime(s: string): string | null {
  const m = s.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m || !isRealDate(m[1]) || Number(m[2]) > 23 || Number(m[3]) > 59) return null;
  return `${m[1]}T${m[2]}:${m[3]}:${m[4] ?? "00"}`;
}

function addOneHour(localDateTime: string): string {
  // Do the math as if it were UTC so the computer's own time zone doesn't matter.
  const d = new Date(`${localDateTime}Z`);
  d.setUTCHours(d.getUTCHours() + 1);
  return d.toISOString().slice(0, 19);
}

// True for real IANA names like "America/New_York"; false for "PST", "", or made-up names.
export function isRealTimeZone(tz: string | undefined): boolean {
  if (!tz?.includes("/")) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz.trim() });
    return true;
  } catch {
    return false;
  }
}

// Gemini tends to say it is very confident even when it guessed. So we also ask it two
// simple questions (yearSource, unsure) and cap the confidence based on the answers.
// Anything below 0.7 gets flagged for review in the side panel.
function honestConfidence(e: GeminiEvent): number {
  let conf = Number(e.confidence);
  if (Number.isNaN(conf)) conf = 0.5; // garbage -> "not sure"
  conf = Math.min(1, Math.max(0, conf));

  if (e.unsure || e.yearSource === "guessed") conf = Math.min(conf, 0.6);
  else if (e.yearSource === "context") conf = Math.min(conf, 0.9);

  return Math.round(conf * 100) / 100;
}

// Today's date as YYYY-MM-DD in a given time zone.
export function todayIn(timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date());
}
