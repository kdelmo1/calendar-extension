// Plain-English edits (optional task): "move the midterm to Friday", "delete all the holidays",
// "add a study group every Thursday 7-9 PM".
//
// How it works (Gemini function calling):
//   1. We send Gemini the events as short numbered lines (e1, e2, ...) plus the instruction,
//      and three functions it may call: update_events, delete_events, add_events.
//   2. Gemini answers with the function calls it wants (it can make several at once).
//   3. WE run those calls on the event list, with the same date checks as /parse,
//      and write the summary from what actually changed.
// Docs: https://ai.google.dev/gemini-api/docs/function-calling

import { randomUUID } from "node:crypto";
import { AppErrorException } from "./errors.js";
import { askGeminiTools, type FunctionCall } from "./gemini.js";
import { CATEGORIES, DEFAULT_TIME_ZONE, fixTimes, isRealTimeZone, todayIn } from "./parse.js";
import { fixRecurrence } from "./recurrence.js";
import type { CalendarEvent, Category, ParseResult } from "./types.js";

export type EditRequest = {
  events: CalendarEvent[];
  instruction: string;
  calendarName?: string; // optional: kept as-is in the result
  timeZone?: string; // optional: used for times and repeat rules (default America/Los_Angeles)
};
export type EditResult = { result: ParseResult; summary: string };

const MAX_EVENTS = 400;
const MAX_INSTRUCTION = 500;

// ---------- the functions Gemini may call ----------

// Fields an event can have when Gemini updates or adds it (all optional for updates).
const eventFields = {
  title: { type: "STRING" },
  allDay: { type: "BOOLEAN", description: "true = no time of day" },
  start: { type: "STRING", description: "YYYY-MM-DD if allDay, else local YYYY-MM-DDTHH:MM" },
  end: { type: "STRING", description: "Inclusive last day (all-day) or end time. Same format as start." },
  category: { type: "STRING", enum: CATEGORIES },
  location: { type: "STRING" },
  description: { type: "STRING" },
  recurrence: {
    type: "STRING",
    description: "Weekly repeat rule like RRULE:FREQ=WEEKLY;BYDAY=TU,TH;UNTIL=20270311, or empty string to stop repeating",
  },
};

const FUNCTIONS = [
  {
    name: "update_events",
    description: "Change some fields of existing events. Only include the fields that change.",
    parameters: {
      type: "OBJECT",
      properties: {
        updates: {
          type: "ARRAY",
          items: { type: "OBJECT", properties: { id: { type: "STRING", description: "e.g. e3" }, ...eventFields }, required: ["id"] },
        },
      },
      required: ["updates"],
    },
  },
  {
    name: "delete_events",
    description:
      "Remove events: the ones listed in ids, PLUS every event matching the filters (startsBefore, startsAfter, " +
      "categories). Filters that are given must all match. Use the filters for rules like 'everything before " +
      "February' or 'all holidays' instead of listing many ids.",
    parameters: {
      type: "OBJECT",
      properties: {
        ids: { type: "ARRAY", items: { type: "STRING" }, description: "e.g. [\"e3\", \"e7\"]" },
        startsBefore: { type: "STRING", description: "YYYY-MM-DD: delete events that start before this day" },
        startsAfter: { type: "STRING", description: "YYYY-MM-DD: delete events that start after this day" },
        categories: { type: "ARRAY", items: { type: "STRING", enum: CATEGORIES }, description: "delete events in these categories" },
      },
    },
  },
  {
    name: "add_events",
    description: "Create new events.",
    parameters: {
      type: "OBJECT",
      properties: {
        events: {
          type: "ARRAY",
          items: { type: "OBJECT", properties: eventFields, required: ["title", "allDay", "start"] },
        },
      },
      required: ["events"],
    },
  },
];

function buildEditPrompt(today: string, timeZone: string): string {
  return `You edit a list of calendar events by calling functions.

Today's date is ${today}. Times are local to ${timeZone}.

Each event is one line: id | start → end | all-day or times | category | title | ↻ repeat rule | @ location

RULES
- Make the change by calling update_events, delete_events and/or add_events. You can call several at once.
- Refer to events by their id (e1, e2, ...). Never invent ids.
- Change ONLY what the instruction asks. In update_events send only the fields that change.
- "Move X to Friday" keeps its time and length; work out "Friday" / "next week" from today's date.
- To delete by a rule ("everything before February", "all holidays", "everything outside January to March"),
  use the delete_events filters (startsBefore, startsAfter, categories) instead of listing ids.
  For "outside a range" give both: startsBefore = first day of the range, startsAfter = last day.
- For other changes to many events ("make every lecture start at 10 AM"), include every matching id in one call.
- Dates: YYYY-MM-DD. Times: YYYY-MM-DDTHH:MM local, no offset. For all-day events end is the last day (inclusive).
- Weekly repeating events use rules like RRULE:FREQ=WEEKLY;BYDAY=TU,TH;UNTIL=20270311. To stop an event
  repeating, set recurrence to "".
- New events: give title, allDay, start (and end, category, location if known).
- If the instruction is not a request to change these events, or it is unclear which events it means,
  call NO function. Instead answer in one short sentence saying what you need.`;
}

// One line per event, with a short id instead of the long one (keeps the request small).
function eventLine(shortId: string, e: CalendarEvent): string {
  const when = e.end && e.end !== e.start ? `${e.start} → ${e.end}` : e.start;
  return [
    shortId,
    when,
    e.allDay ? "all-day" : "timed",
    e.category,
    e.title,
    e.recurrence ? `↻ ${e.recurrence}` : "",
    e.location ? `@ ${e.location}` : "",
  ].filter(Boolean).join(" | ");
}

// ---------- the main function ----------

export async function editEvents(request: EditRequest): Promise<EditResult> {
  const { events, instruction } = validate(request);
  const timeZone = isRealTimeZone(request.timeZone) ? request.timeZone!.trim() : DEFAULT_TIME_ZONE;

  // e1, e2, ... -> the real event
  const byShortId = new Map(events.map((e, i) => [`e${i + 1}`, e]));
  const listText = [...byShortId].map(([id, e]) => eventLine(id, e)).join("\n");
  const message = `Events:\n${listText || "(no events yet)"}\n\nInstruction: ${instruction}`;

  const { calls, text } = await askGeminiTools(buildEditPrompt(todayIn(timeZone), timeZone), [{ text: message }], FUNCTIONS);
  console.log(`/edit: Gemini made ${calls.length} call(s): ${calls.map((c) => c.name).join(", ") || "none"}`);

  const result: ParseResult = {
    calendarName: request.calendarName?.trim() || "Imported dates",
    timeZone,
    events: events.map((e) => ({ ...e })), // copies, so we never change the caller's list
  };
  if (calls.length === 0) {
    // Gemini didn't change anything (e.g. the instruction was unclear): pass on its explanation.
    return { result, summary: text || "No changes made." };
  }

  const changes = applyCalls(calls, byShortId, result, instruction);
  return { result, summary: summarize(changes) };
}

// ---------- running Gemini's function calls ----------

type Changes = { updated: string[]; deleted: string[]; added: string[]; skipped: string[] };

function applyCalls(calls: FunctionCall[], byShortId: Map<string, CalendarEvent>, result: ParseResult, instruction: string): Changes {
  const changes: Changes = { updated: [], deleted: [], added: [], skipped: [] };
  // short id -> our copy in result.events (same order as the original list)
  const copies = new Map([...byShortId.keys()].map((id, i) => [id, result.events[i]]));
  const findCopy = (id: unknown) => (typeof id === "string" ? copies.get(id.trim()) : undefined);

  for (const call of calls) {
    if (call.name === "delete_events") {
      // Events named by id, plus every event matching the filters. Gemini picks the RULE, our code
      // applies it, so a bulk delete ("everything before February") can't miss one.
      const targets = new Set(asArray(call.args.ids).map(findCopy).filter((e): e is CalendarEvent => !!e));
      const filter = deleteFilter(call.args);
      if (filter) result.events.filter(filter).forEach((e) => targets.add(e));
      for (const target of targets) {
        if (!result.events.includes(target)) continue; // already deleted
        result.events.splice(result.events.indexOf(target), 1);
        changes.deleted.push(target.title);
      }
    } else if (call.name === "update_events") {
      for (const update of asArray(call.args.updates) as Record<string, unknown>[]) {
        const target = findCopy(update?.id);
        if (!target || !result.events.includes(target)) continue;
        const updated = applyUpdate(target, update, result.timeZone);
        if (!updated) {
          changes.skipped.push(`"${target.title}" (the new date wasn't valid)`);
          continue;
        }
        Object.assign(target, updated);
        changes.updated.push(target.title);
      }
    } else if (call.name === "add_events") {
      for (const fields of asArray(call.args.events) as Record<string, unknown>[]) {
        const added = buildNewEvent(fields, result.timeZone, instruction);
        if (!added) {
          changes.skipped.push(`a new event "${String(fields?.title ?? "")}" (no valid date)`);
          continue;
        }
        result.events.push(added);
        changes.added.push(added.title);
      }
    } else {
      console.warn(`/edit: ignoring unknown function ${call.name}`);
    }
  }
  return changes;
}

// Returns the event with the update applied, or null if the result would have an invalid date.
function applyUpdate(e: CalendarEvent, u: Record<string, unknown>, timeZone: string): CalendarEvent | null {
  const allDay = typeof u.allDay === "boolean" ? u.allDay : e.allDay;
  let start = typeof u.start === "string" ? u.start : e.start;
  let end = typeof u.end === "string" ? u.end : e.end;

  // "Move X to Friday" usually only sends a new start: keep the same length by moving the end too.
  if (typeof u.start === "string" && typeof u.end !== "string") end = shiftBy(e.end, e.start, start);
  // Switching all-day <-> timed without new times: keep the date, let fixTimes fill sensible defaults.
  if (allDay && !e.allDay) { start = start.slice(0, 10); end = end.slice(0, 10); }

  const times = fixTimes({ allDay, start, end });
  if (!times) return null;

  const wantsRule = typeof u.recurrence === "string" ? u.recurrence : e.recurrence;
  const { rule, ...fixedTimes } = fixRecurrence(wantsRule || null, times, timeZone);
  const changedWhen = typeof u.start === "string" || typeof u.end === "string" || typeof u.allDay === "boolean";

  return {
    ...e,
    ...fixedTimes,
    recurrence: rule,
    title: typeof u.title === "string" && u.title.trim() ? u.title.trim() : e.title,
    category: CATEGORIES.includes(u.category as Category) ? (u.category as Category) : e.category,
    location: typeof u.location === "string" ? u.location.trim() || null : e.location,
    description: typeof u.description === "string" ? u.description.trim() || null : e.description,
    // The user just told us the date, so it no longer needs review.
    confidence: changedWhen ? Math.max(e.confidence, 0.95) : e.confidence,
  };
}

function buildNewEvent(f: Record<string, unknown>, timeZone: string, instruction: string): CalendarEvent | null {
  if (!f || typeof f.start !== "string") return null;
  const times = fixTimes({ allDay: Boolean(f.allDay), start: f.start, end: typeof f.end === "string" ? f.end : undefined });
  if (!times) return null;
  const { rule, ...fixedTimes } = fixRecurrence(f.recurrence ?? null, times, timeZone);
  return {
    id: randomUUID(),
    title: typeof f.title === "string" && f.title.trim() ? f.title.trim() : "New event",
    ...fixedTimes,
    recurrence: rule,
    location: typeof f.location === "string" && f.location.trim() ? f.location.trim() : null,
    description: typeof f.description === "string" && f.description.trim() ? f.description.trim() : null,
    category: CATEGORIES.includes(f.category as Category) ? (f.category as Category) : "event",
    confidence: 0.95, // the user asked for it
    sourceText: `Added from your request: "${instruction}"`,
  };
}

// ---------- helpers ----------

function validate(request: EditRequest): { events: CalendarEvent[]; instruction: string } {
  const instruction = typeof request?.instruction === "string" ? request.instruction.trim() : "";
  if (!instruction) throw new AppErrorException("PARSE_FAILED", "Type what you'd like to change.", 400);
  if (instruction.length > MAX_INSTRUCTION) {
    throw new AppErrorException("PARSE_FAILED", `Please keep the request under ${MAX_INSTRUCTION} characters.`, 400);
  }
  const events = request?.events;
  if (!Array.isArray(events) || events.some((e) => typeof e?.id !== "string" || typeof e?.start !== "string")) {
    throw new AppErrorException("PARSE_FAILED", "The event list sent for editing wasn't valid.", 400);
  }
  if (events.length > MAX_EVENTS) {
    throw new AppErrorException("PARSE_FAILED", `That's too many events to edit at once (max ${MAX_EVENTS}).`, 400);
  }
  return { events, instruction };
}

// The delete_events filters as one test, or null if no (valid) filter was given.
// All given filters must match: { startsBefore: "2027-02-01", categories: ["holiday"] } = holidays before Feb.
function deleteFilter(args: Record<string, unknown>): ((e: CalendarEvent) => boolean) | null {
  const day = (x: unknown) => (typeof x === "string" && /^\d{4}-\d{2}-\d{2}$/.test(x) ? x : null);
  const before = day(args.startsBefore);
  const after = day(args.startsAfter);
  const categories = asArray(args.categories).filter((c): c is Category => CATEGORIES.includes(c as Category));
  if (!before && !after && categories.length === 0) return null;
  return (e) => {
    const start = e.start.slice(0, 10);
    // "before X or after Y" comes as two filters in one call; treat a date pair as "outside the range".
    const dateOk = before && after && before <= after ? start < before || start > after
      : (!before || start < before) && (!after || start > after);
    return dateOk && (categories.length === 0 || categories.includes(e.category));
  };
}

function asArray(x: unknown): unknown[] {
  return Array.isArray(x) ? x : [];
}

// Moves `value` by the same amount `from` moved to `to` (all three are dates or local date-times).
function shiftBy(value: string, from: string, to: string): string {
  const ms = (s: string) => Date.parse(s.length === 10 ? `${s}T00:00:00Z` : `${s.slice(0, 16)}:00Z`);
  const delta = ms(to) - ms(from);
  if (Number.isNaN(delta) || Number.isNaN(ms(value))) return to;
  const moved = new Date(ms(value) + delta).toISOString();
  return to.length === 10 ? moved.slice(0, 10) : moved.slice(0, 16);
}

// "Updated 2 events: Final Examinations, Grades Due. Deleted 4 events: ..."
function summarize(c: Changes): string {
  const list = (titles: string[]) =>
    titles.length <= 3 ? titles.map((t) => `"${t}"`).join(", ") : `${titles.slice(0, 3).map((t) => `"${t}"`).join(", ")} and ${titles.length - 3} more`;
  const plural = (n: number) => `${n} event${n === 1 ? "" : "s"}`;
  const parts: string[] = [];
  if (c.updated.length) parts.push(`Updated ${plural(c.updated.length)}: ${list(c.updated)}.`);
  if (c.deleted.length) parts.push(`Deleted ${plural(c.deleted.length)}: ${list(c.deleted)}.`);
  if (c.added.length) parts.push(`Added ${plural(c.added.length)}: ${list(c.added)}.`);
  if (c.skipped.length) parts.push(`Skipped ${c.skipped.join("; ")}.`);
  return parts.join(" ") || "No changes made.";
}
