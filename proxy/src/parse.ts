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

  const events: CalendarEvent[] = r.events.map((e) => {
    const start = String(e.start ?? "");
    const end = String(e.end || start);
    return {
      id: randomUUID(),
      title: String(e.title ?? "Untitled event"),
      allDay: Boolean(e.allDay),
      start: e.allDay ? start.slice(0, 10) : start,
      end: e.allDay ? end.slice(0, 10) : end,
      recurrence: e.recurrence || null,
      location: e.location || null,
      description: e.description || null,
      category: CATEGORIES.includes(e.category as Category) ? (e.category as Category) : "event",
      confidence: honestConfidence(yearMissing ? { ...e, yearSource: "guessed" } : e),
      sourceText: String(e.sourceText ?? ""),
    };
  });

  if (events.length === 0) {
    throw new AppErrorException("NO_DATES", "We couldn't find any dates in what you selected.", 422);
  }

  return {
    calendarName: r.calendarName?.trim() || "Imported dates",
    timeZone: r.timeZone?.trim() || DEFAULT_TIME_ZONE,
    events,
  };
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
