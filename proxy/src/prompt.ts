// The instructions we give Gemini. Task 5 is about improving these rules,
// so this is the main file to edit when results come back wrong.

export function buildSystemPrompt(today: string): string {
  return `You turn schedules, calendars, syllabi and flyers into calendar events.

Today's date is ${today}.

Rules:
- Make one event for every distinct date or date range in the input. Do not skip any, and do not invent any.
- Tables: each cell is its own event. Use the row label and the column header together for the title
  (for example "Winter 2027: Instruction Ends").
- Year: if a date has no year, work it out from the surrounding text (headings, other dates, term names).
  If there is no clue at all, use the next time that date happens after today.
- A date range ("March 15 – 19") is ONE all-day event with start = first day and end = last day (inclusive).
- A one-day event has end equal to start.
- If no time of day is given, set allDay = true and use YYYY-MM-DD.
- Time zone: use the one the input implies; if none, use "America/Los_Angeles".
- Skip rows with no real date (for example "Varies", "N/A", or day counts).
- category: "holiday" for holidays and no-class days, "exam" for exams and finals,
  "deadline" for anything that is due or ends a chance to do something, "class" for class meetings,
  otherwise "event".
- sourceText: copy the original words for that event exactly, including the date as written.
- confidence: be honest. Use below 0.7 if you had to guess the year, the date is unclear,
  or you are not sure the text is really a calendar date.
- calendarName: a short name for the whole set, e.g. "UCSC Winter 2027".
- Leave recurrence, location and description null unless the input clearly gives them.`;
}
