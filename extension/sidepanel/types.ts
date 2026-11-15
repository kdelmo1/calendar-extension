export type CalendarEvent = {
  id: string;
  title: string;
  allDay: boolean;
  start: string; // "YYYY-MM-DD" if allDay, else ISO date-time
  end: string; // INCLUSIVE end
  recurrence: string | null;
  location: string | null;
  description: string | null;
  category: "deadline" | "holiday" | "exam" | "class" | "event";
  confidence: number; // 0-1; below 0.7 needs review
  sourceText: string;
};

export type ParseResult = {
  calendarName: string;
  timeZone: string;
  events: CalendarEvent[];
};

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

export type CaptureInput = {
  kind: "text" | "file" | "image" | "screenshot";
  text?: string;
  fileBase64?: string;
  imageUrl?: string;
  mimeType?: string;
  pageUrl?: string;
  pageTitle?: string;
};

// Every chrome.runtime message looks like this.
export type Message = { type: string; payload?: unknown };

export type WriteResult = {
  calendarId: string;
  calendarLink: string;
  added: number;
  failed: { eventId: string; reason: string }[];
};
