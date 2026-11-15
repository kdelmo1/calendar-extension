// Tests every kind of CaptureInput that isn't plain text: PDF, image, screenshot,
// right-clicked image URL, data: URL, and a .md file. Also checks error cases.
//
// Usage (server must be running in another terminal with `npm run dev`):
//   npm run try:files
//
// Answer keys live in fixtures/inputs/expected.json.

import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import type { AppError, CaptureInput, ParseResult } from "../src/types.js";

const SERVER = process.env.PROXY_URL || "http://localhost:8080";
const inputs = new URL("../../fixtures/inputs/", import.meta.url);
const file = (name: string) => readFileSync(new URL(name, inputs));
const b64 = (name: string) => file(name).toString("base64");

type Expected = { title: string; start: string; end: string };
const answers: Record<string, Expected[]> = JSON.parse(file("expected.json").toString("utf8"));

// A tiny local web server so we can test "download the right-clicked image".
const imageServer = createServer((_req, res) => {
  res.writeHead(200, { "Content-Type": "image/png" });
  res.end(file("flyer.png"));
});
await new Promise<void>((resolve) => imageServer.listen(0, "127.0.0.1", resolve));
const imagePort = (imageServer.address() as AddressInfo).port;

// ---------- cases that should succeed ----------
const goodCases: { name: string; key: string; input: CaptureInput }[] = [
  { name: "PDF file", key: "flyer", input: { kind: "file", fileBase64: b64("flyer.pdf"), mimeType: "application/pdf" } },
  { name: "PNG file", key: "flyer", input: { kind: "file", fileBase64: b64("flyer.png"), mimeType: "image/png" } },
  { name: "Screenshot (no mimeType)", key: "flyer", input: { kind: "screenshot", fileBase64: b64("flyer.png") } },
  { name: "Right-clicked image URL", key: "flyer", input: { kind: "image", imageUrl: `http://127.0.0.1:${imagePort}/flyer.png` } },
  { name: "Image as data: URL", key: "flyer", input: { kind: "image", imageUrl: `data:image/png;base64,${b64("flyer.png")}` } },
  { name: "Markdown file (empty mimeType)", key: "syllabus", input: { kind: "file", fileBase64: b64("syllabus.md"), mimeType: "" } },
];

// ---------- cases that should fail with a specific AppError ----------
const badCases: { name: string; code: AppError["code"]; input: CaptureInput }[] = [
  { name: "Unsupported type (GIF)", code: "PARSE_FAILED", input: { kind: "file", fileBase64: Buffer.from("GIF89a....").toString("base64"), mimeType: "image/gif" } },
  { name: "Empty file", code: "NO_DATES", input: { kind: "file", fileBase64: "" } },
  { name: "Image URL that 404s", code: "PARSE_FAILED", input: { kind: "image", imageUrl: `http://127.0.0.1:1/nothing.png` } },
  { name: "Not a URL", code: "PARSE_FAILED", input: { kind: "image", imageUrl: "javascript:alert(1)" } },
];

async function post(input: CaptureInput) {
  const res = await fetch(`${SERVER}/parse`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return { status: res.status, body: await res.json() };
}

let passed = 0;
let total = 0;

for (const c of goodCases) {
  total++;
  const started = Date.now();
  const { status, body } = await post(c.input);
  const secs = ((Date.now() - started) / 1000).toFixed(1);
  if (status !== 200) {
    console.log(`\nFAIL  ${c.name}: HTTP ${status} ${JSON.stringify(body)}`);
    continue;
  }
  const result = body as ParseResult;
  const want = answers[c.key];
  const missing = want.filter(
    (w) => !result.events.some((g) => g.start.startsWith(w.start) && g.end.startsWith(w.end)),
  );
  const ok = missing.length === 0;
  if (ok) passed++;
  console.log(`\n${ok ? "PASS" : "FAIL"}  ${c.name}  (${secs} s, ${result.events.length} events, ${want.length - missing.length}/${want.length} expected found)`);
  for (const e of result.events) {
    const flag = e.confidence < 0.7 ? "  <- low confidence" : "";
    console.log(`      ${e.start} .. ${e.end}  [${e.category}] ${e.title}${flag}`);
  }
  for (const m of missing) console.log(`      MISSING: ${m.start} .. ${m.end}  ${m.title}`);
}

for (const c of badCases) {
  total++;
  const { status, body } = await post(c.input);
  const ok = status >= 400 && (body as AppError).code === c.code;
  if (ok) passed++;
  console.log(`\n${ok ? "PASS" : "FAIL"}  ${c.name}: HTTP ${status} ${JSON.stringify(body)}`);
}

imageServer.close();
console.log(`\n${passed}/${total} cases passed.`);
