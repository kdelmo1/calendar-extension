// The "response schema" we give Gemini. With this, Gemini is forced to reply
// with JSON in exactly this shape (this is Gemini's "structured output").
//
// It is close to ParseResult, but built to keep Gemini's answer SHORT, because
// the time a request takes depends mostly on how much Gemini has to write:
//   - no `id`: the server adds ids itself
//   - text inputs: `lines` (line numbers) instead of copying `sourceText`
//   - `end`, `location`, `description`, `recurrence` are left out when empty
//   - `yearSource` / `unsure` are extra, only used to keep confidence honest
// parse.ts turns the answer back into a proper ParseResult.
//
// Format: Gemini's OpenAPI-style schema (types are written in CAPITALS).
// Docs: https://ai.google.dev/gemini-api/docs/structured-output

// useLines = true for text inputs (we numbered the lines), false for PDFs/images.
export function buildSchema(useLines: boolean) {
  const source = useLines
    ? {
        lines: {
          type: "ARRAY",
          items: { type: "INTEGER" },
          description: "The L-numbers of the line(s) this event came from, e.g. [12] or [4, 5]",
        },
      }
    : {
        sourceText: {
          type: "STRING",
          description: "The exact original snippet this event came from, copied word for word",
        },
      };

  const eventSchema = {
    type: "OBJECT",
    properties: {
      ...source,
      title: { type: "STRING", description: "Short name of the event, e.g. 'Final Examinations'" },
      allDay: { type: "BOOLEAN", description: "true if no specific time of day is given" },
      start: {
        type: "STRING",
        description: "YYYY-MM-DD if allDay, else local date-time YYYY-MM-DDTHH:MM (no offset)",
      },
      end: {
        type: "STRING",
        description: "INCLUSIVE last day or end time. Leave out for one-day all-day events.",
      },
      category: { type: "STRING", enum: ["deadline", "holiday", "exam", "class", "event"] },
      location: { type: "STRING", description: "Leave out if not given" },
      description: { type: "STRING", description: "Leave out unless useful details are given" },
      recurrence: { type: "STRING", description: "RRULE string, e.g. 'RRULE:FREQ=WEEKLY;BYDAY=MO,WE'. Leave out if not repeating" },
      yearSource: { type: "STRING", enum: ["written", "context", "guessed"], description: "Where the year came from" },
      unsure: { type: "BOOLEAN", description: "true if tentative/TBA/approximate, ambiguous, or hard to read" },
      confidence: { type: "NUMBER", description: "0 to 1: how likely the date, time and title are all correct" },
    },
    required: [
      useLines ? "lines" : "sourceText",
      "title", "allDay", "start", "category", "yearSource", "unsure", "confidence",
    ],
    // Gemini writes fields in this order: source first (read before deciding),
    // yearSource/unsure just before confidence (so it thinks about them first).
    propertyOrdering: [
      useLines ? "lines" : "sourceText",
      "title", "allDay", "start", "end", "category", "location", "description",
      "recurrence", "yearSource", "unsure", "confidence",
    ],
  };

  return {
    type: "OBJECT",
    properties: {
      calendarName: { type: "STRING", description: "Short name for the new calendar, e.g. 'UCSC Winter 2027'" },
      timeZone: { type: "STRING", description: "IANA time zone, e.g. 'America/Los_Angeles'" },
      events: { type: "ARRAY", items: eventSchema },
    },
    required: ["calendarName", "timeZone", "events"],
    propertyOrdering: ["calendarName", "timeZone", "events"],
  };
}
