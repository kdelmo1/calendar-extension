// Shared data shapes. These MUST match the team's handoff formats exactly.
// (Copied from the team contract; if the contract changes, change this too.)

// Lane 1 -> Lane 2: what the user gave us
export type CaptureInput = {
  kind: "text" | "file" | "image" | "screenshot";
  text?: string; // highlighted or pasted text
  fileBase64?: string; // uploaded file or screenshot (no data: prefix)
  imageUrl?: string; // right-clicked image
  mimeType?: string; // e.g. "application/pdf", "image/png", "text/plain"
  pageUrl?: string;
  pageTitle?: string;
};

export type Category = "deadline" | "holiday" | "exam" | "class" | "event";

// Lane 2 -> Lane 4 -> Lane 3: the events
export type CalendarEvent = {
  id: string;
  title: string;
  allDay: boolean;
  start: string; // "YYYY-MM-DD" if allDay, else ISO date-time
  end: string; // INCLUSIVE; Lane 3 converts to Google's exclusive end
  recurrence: string | null; // RRULE string or null
  location: string | null;
  description: string | null;
  category: Category;
  confidence: number; // 0-1; below 0.7 is flagged for review
  sourceText: string; // the original snippet this event came from
};

export type ParseResult = {
  calendarName: string;
  timeZone: string;
  events: CalendarEvent[];
};

// Every lane returns errors in this shape
export type AppError = {
  code:
    | "AUTH_DENIED"
    | "NO_DATES"
    | "RATE_LIMIT"
    | "TIMEOUT"
    | "PARSE_FAILED"
    | "PARTIAL_WRITE"
    | "CALENDAR_ERROR";
  message: string; // plain English; Lane 4 shows it to the user
};
