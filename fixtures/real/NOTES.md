# Task 9: real-input testing notes

10 real inputs, answer keys in `answers.json`, run with `npm run try:real` (in `proxy/`).
Full per-run details (every event) go to `proxy/out/real-report.md`.

| # | Input | Type |
|---|-------|------|
| 1 | `ucsc-key-dates` | UCSC registrar page, highlighted text (153 events, 3 parallel parts) |
| 2 | `ucsd-calendar-pdf` | UC San Diego academic calendar PDF |
| 3 | `cse20-syllabus-text` | CSE 20 Canvas syllabus, copied text (377 lines) |
| 4 | `cse201-syllabus-pdf` | CSE 201 syllabus PDF with a schedule table |
| 5 | `cse200-syllabus-pdf` | CSE 200 syllabus PDF, mostly policy text, one deadline |
| 6 | `hw-test-dates-text` | HW due dates + test windows, flattened table, no year |
| 7 | `ska-flyer-photo` | Photo of a paper concert flyer |
| 8 | `forum-flyer-png` | Digital event flyer, no year |
| 9 | `hackathon-screenshot` | Screenshot of a 2-day schedule web page |
| 10 | `unity-itinerary-pdf` | Run-of-show PDF with times but no date |

Decisions (Nov 14, 2026):
- Every dated syllabus item becomes an event (lecture rows = `class`).
- A schedule with times but no date: make the events, all flagged for review.
- Weekly meetings with no specific date (sections, regular office hours) are not events.

## Run 1: baseline (prompt from task 5/6) → 7/10

| Input | Problem | Cause |
|-------|---------|-------|
| cse20-syllabus-text | Midterm "wrong category" | Runner bug: it compared the Midterm against "Office hours cancelled" on the same day. Fixed the runner (pick the best match by category, then title). |
| cse20-syllabus-text | Single events "DIS 03A" on Nov 16, "CSE 20 Lecture" on Nov 17 | Weekly meetings put on a made-up date. Hidden at first by a too-lenient answer key; key made stricter. |
| cse201-syllabus-pdf | 8 lecture rows missing | Gemini kept only "notable" rows (quizzes, final, Thanksgiving) and skipped topic-only rows. |
| cse201-syllabus-pdf | "HW1/2/3/4 released" as deadlines on neighbouring dates | Rows with no date borrowed the date of the row next to them. |
| hw-test-dates-text | Test window 11/16–11/20 twice | Two homeworks share one test window; Gemini made one per homework. |

What went right already: year guessing for undated lists (2026, the current term, all flagged), PDFs
with dot leaders, photos, screenshots with time zones, and a 9-page policy PDF with one real date.

## Prompt changes (all general rules, not fixes for one file)

1. Course schedules: every dated row is an event, including topic-only lecture rows.
2. Never borrow a date: undated items ("HW1 released", "TBA") are not events.
3. Weekly meetings with no specific date are not events; dated changes to them are.
4. Don't repeat an event: the same date range for the same thing listed twice → one event.
5. A no-year list that fits the current term is this term, even if some dates have passed.

## Run 2 → 9/10

All three fixed. New failure: `unity-itinerary-pdf` events were put on today's date with
confidence 0.9 instead of being flagged (in run 1 they happened to be flagged).

6. Times but no date anywhere: use today as a placeholder and mark every event unsure/guessed.

Unity then passed twice in a row (38/38 events flagged).

## Run 3 (all suites) → 10/10

| Suite | Result |
|-------|--------|
| `try:real` | **10/10 need no fixes** |
| `try:prompt` | 11/11 |
| `try:files` | 10/10 |
| `try:errors` | 16/16 |

Caveats:
- Gemini's answers vary a little from run to run (Unity flipped between runs 1 and 2), so one
  10/10 run is not a guarantee. Rerun `try:real` after any prompt or model change.
- `forum-flyer-png` has no year ("Nov. 17th") but was not flagged in run 3 (it was in run 1).
  The date is right, and the key doesn't require a flag, so it passes. For images our code can't
  check the year itself (for text it can, see `yearIsMissing` in parse.ts).

## Optional task: repeating events (RRULE)

Decisions: in syllabi only class meetings repeat (not office hours or lists of alternative
sections); a dated schedule gets no extra repeating lecture; a weekly meeting with no dates is
added but flagged. Answer key change: `cse200-syllabus-pdf` now also expects its weekly Tuesday
lecture (repeating, flagged).

| Problem found | Fix |
|---|---|
| Dated schedule + "Lectures MW 3:20" → repeating lecture on top of the dated rows | Prompt: check for a dated schedule FIRST; give dated rows the class time |
| Dated lecture rows came back all-day | Prompt: lecture rows on class days are timed events |
| CSE 20: one of 5 alternative sections as a one-time event | Prompt: skip alternative sections completely |
| Test windows labelled `event` | Prompt: test windows are `exam` |
| Timed events ending after 1 hour (end left out) | Prompt: always give `end` for timed events (this came from the task 6 speed change) |
| CSE 200 weekly lecture not flagged (Gemini "knew" the term dates) | Code: a repeating event whose source text has no date is always flagged |
| CSE 20 split into 3 parts: the part with "T/TH 9:50" can't see the dated schedule | Code: drop a repeating class event when 3+ dated class rows cover its days; give them its time |

Results after all fixes: `try:prompt` 17/17, `try:files` 10/10, `try:errors` 18/18,
`try:real` 9/10 and 9/10 in two runs (8, 9, 8, 9, 9 over the last five runs).

Still flaky (passes most runs, fails some):
- `cse201-syllabus-pdf`: "HW1/2/3/4 released" sometimes get borrowed dates again. It's a PDF, so
  our code can't double-check the source lines.
- `hw-test-dates-text`: "All deadlines are 12 noon" sometimes ignored (all-day instead of 12:00).
