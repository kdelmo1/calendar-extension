# proxy/ — Gemini server (Lane 2)

Small Node server that turns a `CaptureInput` into a `ParseResult` with Gemini.
The Gemini API key lives only here, never in the extension.

## Run it locally

```bash
cd proxy
npm install
cp .env.example .env      # then paste the real GEMINI_API_KEY into .env
npm run dev               # http://localhost:8080, restarts when you save a file
```

Optional in `.env`: `GEMINI_MODEL=gemini-3.5-flash` to try a different model.

## Endpoints

| Method | Path      | Body           | Success (200)  | Failure (4xx/5xx)         |
|--------|-----------|----------------|----------------|---------------------------|
| GET    | `/health` | –              | `{ "ok": true }` | –                       |
| POST   | `/parse`  | `CaptureInput` | `ParseResult`  | `AppError { code, message }` |

Quick test with curl:

```bash
curl -s localhost:8080/parse -H "Content-Type: application/json" \
  -d '{"kind":"text","text":"Midterm: Feb 10, 2027. Spring break March 22-26, 2027."}'
```

## Check accuracy on the UCSC page

With the server running, in a second terminal:

```bash
npm run try:ucsc
```

It sends `fixtures/inputs/ucsc-key-dates.txt` and checks every date in
`fixtures/ucsc-winter.json`. Full answer is saved to `proxy/out/ucsc-result.json`
(ignored by git).

## Check files and images

```bash
npm run try:files
```

Sends a test flyer (as PDF, PNG, screenshot, image URL and `data:` URL) and a
syllabus `.md` file, and checks them against `fixtures/inputs/expected.json`.
Also checks that bad inputs (GIF, empty file, broken URL) return the right `AppError`.

What each `CaptureInput.kind` does:

| kind         | What we send to Gemini                                              |
|--------------|---------------------------------------------------------------------|
| `text`       | the text                                                            |
| `file`       | `.txt`/`.md`: decoded to text. PDF/PNG/JPEG/WEBP: the file itself   |
| `screenshot` | the image (assumed PNG if no `mimeType`)                            |
| `image`      | `fileBase64` if given, else the server downloads `imageUrl` (10 s limit) |

Files must be under 14 MB. If `mimeType` is missing, the server looks at the
file's first bytes to work out the type.

## Check the prompt rules

```bash
npm run try:prompt
```

Runs the small tricky inputs in `fixtures/inputs/prompt-cases.json`, one or more per rule
(year guessing, time zones, ranges, "no class" → holiday, honest confidence, no dates → `NO_DATES`).
**Run this after every change to `src/prompt.ts`.** To add a case, copy one in that file.

How confidence works: Gemini also tells us where each year came from (`written` / `context` /
`guessed`) and whether the date is `unsure` (tentative, TBA, ambiguous). `parse.ts` caps
confidence at 0.6 for guessed or unsure dates and 0.9 for years from context, so those get
flagged for review (< 0.7). If a text input has no year anywhere, every date counts as guessed.

## Free-tier rate limit

The free tier allows **15 requests per minute per model**, shared by everyone using the same key.
Going over gives HTTP 429. Don't run two `try:` scripts back to back; wait a minute between them.

## Files

| File                  | What it does                                         |
|-----------------------|------------------------------------------------------|
| `src/server.ts`       | Express server and routes                            |
| `src/parse.ts`        | CaptureInput → Gemini message → cleaned ParseResult  |
| `src/inputs.ts`       | Text / files / images / image URLs → Gemini message  |
| `src/gemini.ts`       | The one place that calls the Gemini REST API         |
| `src/prompt.ts`       | Rules we give Gemini (edit this to improve accuracy) |
| `src/schema.ts`       | JSON shape Gemini must reply with                    |
| `src/types.ts`        | Team handoff types (keep in sync with the contract)  |
| `src/errors.ts`       | `AppErrorException` → `AppError` replies             |
| `scripts/try-ucsc.ts` | Accuracy check against the fixture                   |
| `scripts/try-files.ts`| Checks PDFs, images, screenshots, URLs, .md files    |
| `scripts/try-prompt.ts`| Checks each prompt rule with small tricky inputs    |
