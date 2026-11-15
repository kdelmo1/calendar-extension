// Turns a CaptureInput into a ParseResult using Gemini.

import { randomUUID } from "node:crypto";
import { AppErrorException } from "./errors.js";
import { askGemini } from "./gemini.js";
import { buildParts } from "./inputs.js";
import { buildSystemPrompt } from "./prompt.js";
import type { CalendarEvent, CaptureInput, Category, ParseResult } from "./types.js";

const DEFAULT_TIME_ZONE = "America/Los_Angeles";
const CATEGORIES: Category[] = ["deadline", "holiday", "exam", "class", "event"];

export async function parseCapture(input: CaptureInput): Promise<ParseResult> {
  const parts = await buildParts(input); // text, file or image -> Gemini message (see inputs.ts)
  const today = todayIn(DEFAULT_TIME_ZONE);
  const raw = await askGemini(buildSystemPrompt(today), parts);
  return cleanUp(raw);
}

// Checks Gemini's answer, fills in safe defaults, and adds an id to every event.
function cleanUp(raw: unknown): ParseResult {
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
      confidence: clamp(Number(e.confidence)),
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

// Keep confidence between 0 and 1 (and treat garbage as "not sure").
function clamp(n: number): number {
  if (Number.isNaN(n)) return 0.5;
  return Math.min(1, Math.max(0, n));
}

// Today's date as YYYY-MM-DD in a given time zone.
function todayIn(timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date());
}
