// The "response schema" we give Gemini. With this, Gemini is forced to reply
// with JSON in exactly this shape (this is Gemini's "structured output").
//
// It matches ParseResult, except events have no `id`: the server adds ids
// itself so they are always unique.
//
// Format: Gemini's OpenAPI-style schema (types are written in CAPITALS).
// Docs: https://ai.google.dev/gemini-api/docs/structured-output

const eventSchema = {
  type: "OBJECT",
  properties: {
    title: { type: "STRING", description: "Short name of the event, e.g. 'Final Examinations'" },
    allDay: { type: "BOOLEAN", description: "true if no specific time of day is given" },
    start: {
      type: "STRING",
      description: "YYYY-MM-DD if allDay, else local ISO date-time YYYY-MM-DDTHH:MM:SS (no offset)",
    },
    end: {
      type: "STRING",
      description: "INCLUSIVE last day (YYYY-MM-DD) if allDay, else local end date-time. Same as start for one-day events.",
    },
    recurrence: {
      type: "STRING",
      nullable: true,
      description: "RRULE string like 'RRULE:FREQ=WEEKLY;BYDAY=MO,WE;UNTIL=20270315', or null",
    },
    location: { type: "STRING", nullable: true },
    description: { type: "STRING", nullable: true },
    category: {
      type: "STRING",
      enum: ["deadline", "holiday", "exam", "class", "event"],
    },
    confidence: {
      type: "NUMBER",
      description: "0 to 1: how sure you are that the date, title and category are right",
    },
    sourceText: {
      type: "STRING",
      description: "The exact original snippet this event came from, copied word for word",
    },
  },
  required: [
    "title", "allDay", "start", "end", "recurrence",
    "location", "description", "category", "confidence", "sourceText",
  ],
  propertyOrdering: [
    "sourceText", "title", "allDay", "start", "end", "recurrence",
    "location", "description", "category", "confidence",
  ],
};

export const parseResultSchema = {
  type: "OBJECT",
  properties: {
    calendarName: { type: "STRING", description: "Short name for the new calendar, e.g. 'UCSC Winter 2027'" },
    timeZone: { type: "STRING", description: "IANA time zone, e.g. 'America/Los_Angeles'" },
    events: { type: "ARRAY", items: eventSchema },
  },
  required: ["calendarName", "timeZone", "events"],
  propertyOrdering: ["calendarName", "timeZone", "events"],
};
