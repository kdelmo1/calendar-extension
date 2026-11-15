// Turns a CaptureInput into a ParseResult using Gemini.

import { randomUUID } from "node:crypto";
import { AppErrorException } from "./errors.js";
import { askGemini, type GeminiPart } from "./gemini.js";
import { buildParts } from "./inputs.js";
import { buildSystemPrompt } from "./prompt.js";
import type { CalendarEvent, CaptureInput, Category, ParseResult } from "./types.js";

const DEFAULT_TIME_ZONE = "America/Los_Angeles";
const CATEGORIES: Category[] = ["deadline", "holiday", "exam", "class", "event"];

export async function parseCapture(input: CaptureInput): Promise<ParseResult> {
  const parts = await buildParts(input); // text, file or image -> Gemini message (see inputs.ts)
  const today = todayIn(DEFAULT_TIME_ZONE);
  const raw = await askGemini(buildSystemPrompt(today), parts);
  return cleanUp(raw, yearIsMissing(parts));
}

// True if the input is all text and has no year anywhere (like "Bake sale March 3").
// Then every year Gemini gives is a guess, whatever it says. We can't check this for
// PDFs and images because we can't read them ourselves.
function yearIsMissing(parts: GeminiPart[]): boolean {
  if (!parts.every((p) => "text" in p)) return false;
  const allText = parts.map((p) => ("text" in p ? p.text : "")).join("\n");
  return !/\b(19|20)\d{2}\b|'\d{2}\b/.test(allText); // e.g. 2027, 1999, '27
}

// Checks Gemini's answer, fills in safe defaults, and adds an id to every event.
function cleanUp(raw: unknown, yearMissing: boolean): ParseResult {
  const r = raw as Partial<ParseResult> | null;
  if (!r || !Array.isArray(r.events)) {
    throw new AppErrorException("PARSE_FAILED", "Gemini's answer was missing the event list.", 502);
  }

  if (r.events.length === 0) {
    throw new AppErrorException("NO_DATES", "We couldn't find any dates in what you selected.", 422);
  }

  const events: CalendarEvent[] = [];
  for (const e of r.events) {
    const times = fixTimes(e);
    if (!times) {
      // A date we can't use (e.g. "sometime", "2027-02-30"): skip this event, keep the rest.
      console.warn("Skipping event with unusable date:", JSON.stringify(e).slice(0, 200));
      continue;
    }
    events.push({
      id: randomUUID(),
      title: String(e.title || "Untitled event"),
      ...times,
      recurrence: e.recurrence || null,
      location: e.location || null,
      description: e.description || null,
      category: CATEGORIES.includes(e.category as Category) ? (e.category as Category) : "event",
      confidence: honestConfidence(yearMissing ? { ...e, yearSource: "guessed" } : e),
      sourceText: String(e.sourceText ?? ""),
    });
  }

  if (events.length === 0) {
    // Gemini found "events" but none had a usable date: its answer is unusable.
    throw new AppErrorException("PARSE_FAILED", "We found dates but couldn't understand them. Please try again.", 502);
  }

  return {
    calendarName: r.calendarName?.trim() || "Imported dates",
    timeZone: isRealTimeZone(r.timeZone) ? r.timeZone!.trim() : DEFAULT_TIME_ZONE,
    events,
  };
}

// Checks and tidies one event's dates. Returns null if the start date is unusable.
//   all-day: "YYYY-MM-DD"            timed: "YYYY-MM-DDTHH:MM:SS" (local time, no offset)
// Rules: a bad or too-early end becomes the start (all-day) or start + 1 hour (timed).
function fixTimes(e: Partial<CalendarEvent>): Pick<CalendarEvent, "allDay" | "start" | "end"> | null {
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
function isRealTimeZone(tz: string | undefined): boolean {
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
function honestConfidence(e: Partial<CalendarEvent> & { yearSource?: string; unsure?: boolean }): number {
  let conf = Number(e.confidence);
  if (Number.isNaN(conf)) conf = 0.5; // garbage -> "not sure"
  conf = Math.min(1, Math.max(0, conf));

  if (e.unsure || e.yearSource === "guessed") conf = Math.min(conf, 0.6);
  else if (e.yearSource === "context") conf = Math.min(conf, 0.9);

  return Math.round(conf * 100) / 100;
}

// Today's date as YYYY-MM-DD in a given time zone.
function todayIn(timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date());
}
