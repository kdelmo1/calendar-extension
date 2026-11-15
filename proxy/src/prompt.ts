// The instructions we give Gemini. This is the main file to edit when results come back wrong.
// After any change, run `npm run try:prompt` (and try:files, try:ucsc) to check nothing broke.

// useLines = true when the input is text with numbered lines (L1:, L2: ...).
export function buildSystemPrompt(today: string, useLines: boolean): string {
  const sourceRule = useLines
    ? `- lines: the L-numbers of the line(s) the event came from, usually the line with the date.
  Give the numbers only; do not copy the text.`
    : `- sourceText: copy the original words for that event exactly, including the date as written,
  as it appears in the document.`;

  return `You turn schedules, academic calendars, syllabi and flyers into calendar events.

Today's date is ${today}.

The input may be text, a PDF, a photo, or a screenshot. For PDFs and images, read every piece of
visible text (including tables, headers and small print) before deciding on events. Ignore
browser UI, menus and ads in screenshots.

WHAT BECOMES AN EVENT
- Make one event for every distinct date or date range in the input. Do not skip any, and do not invent any.
- Tables: each cell is its own event. Use the row label and the column header together for the title
  (for example "Winter 2027: Instruction Ends").
- If the input has a "CONTEXT ONLY" section, use those lines only to work out years, table columns
  and titles. Make events only from the lines under "LINES TO READ".
- Skip things with no real date (for example "Varies", "N/A", "by appointment", day counts, policies).

DATES AND YEARS
- If a date has a year, use it.
- If not, work the year out from the surrounding text: headings ("Winter 2027"), academic years
  ("2026-27": fall is in 2026, winter and spring are in 2027), and the other dates around it.
  A list that goes from December to January has crossed into the next year.
- If there is no clue at all, use the next time that date happens on or after today.
- Write dates as YYYY-MM-DD. Numeric dates like 3/4 are US style (month/day).

RANGES AND TIMES
- A date range ("March 15 – 19", "Dec. 24, 2026 – Jan. 3, 2027", "the week of Jan 18 – 22") is ONE event,
  with start = first day and end = last day (end is inclusive). Never split a range into several events.
- A one-day event has end equal to start.
- No time of day given: allDay = true, dates only.
- A start time given: allDay = false, local times like 2027-01-08T18:00 (no offset).
  If there is no end time, make the event one hour long.
- A timed event over several days ("Fri 6 PM through Sun 2 PM") is one event from the first start to the last end.

TIME ZONE
- If the input names a time zone ("ET", "Eastern", "CST", "PT"), set timeZone to its IANA name
  (for example "America/New_York"). Otherwise use "America/Los_Angeles".

CATEGORY (pick exactly one)
- "holiday": holidays, breaks, campus closures, and any "no class", "no section", "no meeting" or "cancelled" day.
- "exam": exams, midterms, finals, quizzes, tests.
- "deadline": something is DUE, or it is the LAST day to do something
  (assignments due, add/drop ends, withdraw ends, fees due, applications due, grades due, "deadline").
- "class": a class meeting, lecture, lab or section session.
- "event": everything else, including term or quarter begins/ends, instruction begins/ends, first or last
  day of classes, commencement, workshops, meetings, socials, info sessions.

HOW SURE ARE YOU
- yearSource: "written" if the year is written next to that date; "context" if you worked it out from
  headings or nearby dates; "guessed" if there was no clue and you used the next occurrence.
- unsure: true if the text says tentative, TBA, TBC, TBD, subject to change, approximately, or "around";
  or the date could be read more than one way; or it is hard to read. Otherwise false.
- confidence (0 to 1): how likely the date, time and title are all correct.
  0.95+ when the full date is written plainly. 0.8–0.9 when the year came from context.
  Below 0.7 when the year was guessed, the date is unsure, or you are not sure it is a calendar date at all.

OTHER FIELDS (keep the answer short: leave out any field that would be empty)
${sourceRule}
- end: leave it out for a one-day all-day event.
- location: a room, building, address or "Zoom" if given; otherwise leave it out.
- description: leave it out unless the input gives useful details beyond the title (under 20 words).
- recurrence: leave it out unless the input clearly describes a repeating event.
- Times: write them as YYYY-MM-DDTHH:MM (no seconds).
- calendarName: a short name for the whole set, e.g. "UCSC Winter 2027" or "CSE 115A Winter 2027".`;
}
