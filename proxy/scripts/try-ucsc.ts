// Sends the UCSC key-dates text to the local server and checks the answer
// against our hand-written fixture.
//
// Usage (server must be running in another terminal with `npm run dev`):
//   npm run try:ucsc
//
// It prints every Winter 2027 date from the fixture as FOUND or MISSING,
// and saves Gemini's full answer to proxy/out/ucsc-result.json.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import type { CaptureInput, ParseResult } from "../src/types.js";

const SERVER = process.env.PROXY_URL || "http://localhost:8080";
const text = readFileSync(new URL("../../fixtures/inputs/ucsc-key-dates.txt", import.meta.url), "utf8");
const expected: ParseResult = JSON.parse(
  readFileSync(new URL("../../fixtures/ucsc-winter.json", import.meta.url), "utf8"),
);

const input: CaptureInput = {
  kind: "text",
  text,
  pageTitle: "Academic & Administrative Calendar – Office of the Registrar",
  pageUrl: "https://registrar.ucsc.edu/calendar/",
};

console.log(`Sending ${text.length} characters to ${SERVER}/parse ...`);
const started = Date.now();
const res = await fetch(`${SERVER}/parse`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(input),
});
const body = await res.json();
console.log(`HTTP ${res.status} in ${((Date.now() - started) / 1000).toFixed(1)} s\n`);

if (!res.ok) {
  console.log("Error from server:", body);
  process.exit(1);
}

const result = body as ParseResult;
mkdirSync(new URL("../out/", import.meta.url), { recursive: true });
writeFileSync(new URL("../out/ucsc-result.json", import.meta.url), JSON.stringify(result, null, 2));

console.log(`calendarName: ${result.calendarName}`);
console.log(`timeZone:     ${result.timeZone}`);
console.log(`events:       ${result.events.length} (the page covers all 4 quarters, so expect many)\n`);

// A fixture event counts as FOUND if some result event has the same start and end.
let missing = 0;
for (const want of expected.events) {
  const match = result.events.find((got) => got.start === want.start && got.end === want.end);
  if (!match) missing++;
  const status = match ? "FOUND  " : "MISSING";
  const detail = match ? `-> "${match.title}" [${match.category}, ${match.confidence}]` : "";
  console.log(`${status} ${want.start}${want.end !== want.start ? ".." + want.end : ""}  ${want.title} ${detail}`);
}

const low = result.events.filter((e) => e.confidence < 0.7);
console.log(`\nLow confidence (< 0.7): ${low.length}`);
for (const e of low) console.log(`  ${e.start}  ${e.title}  (${e.confidence})`);

console.log(`\n${expected.events.length - missing}/${expected.events.length} fixture dates found.`);
console.log("Full answer saved to proxy/out/ucsc-result.json");
