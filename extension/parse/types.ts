// Team handoff types used by Lane 2's extension code.
// Copied exactly from the team contract (same as proxy/src/types.ts).
// Other lanes keep their own copies; if the contract changes, update every copy.

export type CaptureInput = {
  kind: "text" | "file" | "image" | "screenshot";
  text?: string; // highlighted or pasted text
  fileBase64?: string; // uploaded file or screenshot (no data: prefix)
  imageUrl?: string; // right-clicked image
  mimeType?: string; // e.g. "application/pdf", "image/png", "text/plain"
  pageUrl?: string;
  pageTitle?: string;
};

export type CalendarEvent = {
  id: string;
  title: string;
  allDay: boolean;
  start: string; // "YYYY-MM-DD" if allDay, else ISO date-time
  end: string; // INCLUSIVE; Lane 3 converts to Google's exclusive end
  recurrence: string | null;
  location: string | null;
  description: string | null;
  category: "deadline" | "holiday" | "exam" | "class" | "event";
  confidence: number; // 0-1; below 0.7 is flagged for review
  sourceText: string;
};

export type ParseResult = { calendarName: string; timeZone: string; events: CalendarEvent[] };

export type AppError = {
  code:
    | "AUTH_DENIED"
    | "NO_DATES"
    | "RATE_LIMIT"
    | "TIMEOUT"
    | "PARSE_FAILED"
    | "PARTIAL_WRITE"
    | "CALENDAR_ERROR";
  message: string;
};
