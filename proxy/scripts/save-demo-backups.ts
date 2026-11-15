// Task 10: saves known-good results for the 3 demo inputs, so the demo still works
// if the network or Gemini fails on stage. The extension (extension/parse/backups.ts)
// uses them automatically when the server can't give an answer.
//
// Usage (uses Cloud Run by default; set PROXY_URL for a local server):
//   npm run save:demo
//
// Each result is only saved if it passes its answer key in fixtures/real/answers.json
// (up to 3 tries). Rerun this after changing the prompt, so the backups match.

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import type { AppError, ParseResult } from "../src/types.js";
import { buildCapture, checkResult, loadInputs, realDir } from "./real-check.js";

const SERVER = process.env.PROXY_URL || "https://calendar-proxy-r76ml3czfq-uw.a.run.app";
const outDir = new URL("../../extension/parse/backups/", import.meta.url);

// How the extension recognises each demo input when the server fails:
//   files/images: the exact bytes (SHA-256 fingerprint) - upload or capture the same file
//   highlighted text: ALL of these phrases appear in it (highlights never come out identical)
//   right-clicked images: the image URL contains one of these
type Match = { sha256?: string; phrases?: string[]; imageUrlIncludes?: string[] };
const DEMOS: { name: string; match: Omit<Match, "sha256">; useHash: boolean }[] = [
  {
    name: "ucsc-key-dates",
    match: {
      // The first 4 are in the Key Dates table; the last 3 are further down, so highlighting
      // only the table is NOT treated as the demo (it would get the full-page backup).
      phrases: ["Instruction Begins", "Final Examinations", "Winter 2027", "Quarter Ends", "Juneteenth", "Withdraw from a Class", "Priority Enrollment"],
    },
    useHash: false,
  },
  {
    name: "forum-flyer-png",
    match: { imageUrlIncludes: ["Forum(English)", "Forum%28English%29"] },
    useHash: true,
  },
  { name: "ucsd-calendar-pdf", match: {}, useHash: true },
];

mkdirSync(outDir, { recursive: true });
const inputs = loadInputs();
let saved = 0;

for (const demo of DEMOS) {
  const input = inputs.find((i) => i.name === demo.name);
  if (!input) throw new Error(`No answer key named ${demo.name}`);
  const capture = buildCapture(input);

  let good: ParseResult | null = null;
  for (let attempt = 1; attempt <= 3 && !good; attempt++) {
    if (attempt > 1) await new Promise((r) => setTimeout(r, 5000));
    const res = await fetch(`${SERVER}/parse`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(capture),
    });
    const body = (await res.json()) as ParseResult | AppError;
    const problems = res.ok ? checkResult(input, body as ParseResult) : [`${(body as AppError).code}: ${(body as AppError).message}`];
    if (problems.length === 0) good = body as ParseResult;
    else console.log(`  ${demo.name} try ${attempt}: ${problems.length} problem(s), e.g. ${problems[0]}`);
  }

  if (!good) {
    console.log(`NOT SAVED  ${demo.name}: no clean result in 3 tries (the old backup, if any, is kept)`);
    continue;
  }

  const match: Match = { ...demo.match };
  if (demo.useHash) match.sha256 = createHash("sha256").update(readFileSync(new URL(input.file, realDir))).digest("hex");

  const backup = { name: demo.name, about: input.about, file: `fixtures/real/${input.file}`, savedAt: new Date().toISOString(), match, result: good };
  writeFileSync(new URL(`${demo.name}.json`, outDir), JSON.stringify(backup, null, 2) + "\n");
  console.log(`SAVED      ${demo.name}: ${good.events.length} events, passes its answer key`);
  saved++;
  await new Promise((r) => setTimeout(r, 4000)); // stay under the rate limit
}

console.log(`\n${saved}/${DEMOS.length} demo backups saved to extension/parse/backups/`);
