// Splits a BIG text input into a few pieces so Gemini can read them in parallel.
//
// Why: Gemini's time grows with how much it writes. 150 events in one answer takes
// ~26 s; three answers of ~50 events, written at the same time, take about a third.
//
// How:
//   1. planChunks  - cut the lines into up to 3 pieces, only between rows
//   2. chunkText   - each piece also gets a few "context only" lines (title, table header)
//                    so Gemini still knows the years and table columns
//   3. mergeAnswers - join the answers, dropping events that came from context-only lines
//
// Line numbers stay the same as in the whole input, so parse.ts can still copy sourceText.

import { AppErrorException } from "./errors.js";

const MIN_LINES_TO_SPLIT = 60; // smaller inputs are fast enough in one call
const LINES_PER_CHUNK = 40;
const MAX_CHUNKS = 3; // each piece is one request; the free tier allows 15 per minute

export type Chunk = { from: number; to: number }; // 1-based line numbers, inclusive

// "Jan. 4", "March 15", "Sept 19" ... (a month name followed by a day number)
const MONTH_DAY = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d/i;

export function planChunks(lines: string[]): Chunk[] {
  const n = lines.length;
  if (n < MIN_LINES_TO_SPLIT) return [{ from: 1, to: n }];

  const count = Math.min(MAX_CHUNKS, Math.ceil(n / LINES_PER_CHUNK));
  const chunks: Chunk[] = [];
  let from = 1;
  for (let k = 1; k < count; k++) {
    const target = Math.round((n * k) / count) + 1; // first line of the next piece
    const cut = findCut(lines, Math.max(target, from + 1));
    chunks.push({ from, to: cut - 1 });
    from = cut;
  }
  chunks.push({ from, to: n });
  return chunks;
}

// Moves a cut forward (up to 15 lines) to a place where the previous row has finished,
// so a table row's label never gets separated from its dates.
function findCut(lines: string[], target: number): number {
  for (let line = target; line < Math.min(target + 15, lines.length); line++) {
    const previous = lines[line - 2].trim(); // line numbers are 1-based
    const rowEnded = previous === "" || previous.includes("|") || /[.!?)]$/.test(previous);
    if (rowEnded) return line;
  }
  return target;
}

// A table header row like "KEY DATES | Fall 2026 | Winter 2027": several columns, no dates.
function isHeaderRow(line: string): boolean {
  return (line.match(/\|/g) ?? []).length >= 2 && !MONTH_DAY.test(line);
}

// Line numbers of the "context only" lines for a piece: the first 2 lines of the input,
// the nearest table header above the piece, and the 2 lines just before it.
function contextLines(lines: string[], chunk: Chunk): number[] {
  if (chunk.from === 1) return [];
  const picked = new Set([1, 2, chunk.from - 2, chunk.from - 1]);
  for (let line = chunk.from - 1; line >= 1; line--) {
    if (isHeaderRow(lines[line - 1])) {
      picked.add(line);
      break;
    }
  }
  return [...picked].filter((line) => line >= 1 && line < chunk.from).sort((a, b) => a - b);
}

// The message text for one piece. `intro` is the page title/URL.
export function chunkText(intro: string, lines: string[], chunk: Chunk): string {
  const show = (line: number) => `L${line}: ${lines[line - 1]}`;
  const context = contextLines(lines, chunk);
  const body: string[] = [];
  for (let line = chunk.from; line <= chunk.to; line++) body.push(show(line));

  return [
    intro,
    "Input (numbered lines). This is one part of a longer input.",
    ...(context.length
      ? ["CONTEXT ONLY (earlier lines; use them for years, table columns and titles, but make NO events from them):",
         ...context.map(show)]
      : []),
    "LINES TO READ:",
    ...body,
  ].filter(Boolean).join("\n");
}

// Joins the pieces' answers into one answer, in the same shape as a single Gemini answer.
type Answer = { calendarName?: string; timeZone?: string; events?: { lines?: number[] }[] };

export function mergeAnswers(answers: unknown[], chunks: Chunk[]): Answer {
  const events: NonNullable<Answer["events"]> = [];
  answers.forEach((raw, i) => {
    const answer = raw as Answer | null;
    if (!answer || !Array.isArray(answer.events)) {
      // Dropping one piece would silently lose dates, so fail the whole thing.
      throw new AppErrorException("PARSE_FAILED", "Gemini's answer was missing the event list.", 502);
    }
    const { from, to } = chunks[i];
    for (const e of answer.events) {
      const ownLine = !Array.isArray(e.lines) || e.lines.length === 0 || e.lines.some((n) => n >= from && n <= to);
      if (ownLine) events.push(e); // events from context-only lines belong to another piece
    }
  });

  const first = answers[0] as Answer; // the first piece has the page title and headings
  return { calendarName: first.calendarName, timeZone: first.timeZone, events };
}
