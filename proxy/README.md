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

## Errors

Every failure comes back as an `AppError` `{ code, message }`. The message is plain
English for the side panel to show.

| What went wrong                                   | code           | HTTP |
|---------------------------------------------------|----------------|------|
| No answer within 30 s (including retries)         | `TIMEOUT`      | 504  |
| Rate limit (429) on both models                   | `RATE_LIMIT`   | 429  |
| Gemini busy (503/500) on both models after retry  | `RATE_LIMIT`   | 429  |
| No events found / nothing captured                | `NO_DATES`     | 422 / 400 |
| Junk or cut-off answer, every date unusable, safety block | `PARSE_FAILED` | 502 |
| Bad file / bad request (400), bad API key (401/403) | `PARSE_FAILED` | 502 |

Retries: if Gemini is busy (503) we wait 0.5 s and try once more, then switch to the
backup model (`GEMINI_BACKUP_MODEL`, default `gemini-3.5-flash`). On a 429 we switch to
the backup model right away, because each model has its own per-minute limit.
Errors that would fail the same way again (400, bad key, junk) are not retried.

Events with impossible dates (e.g. `2027-02-30`) are dropped; an end before the start
is fixed; an unknown time zone becomes `America/Los_Angeles`.

Test all of this without using any quota (a fake Gemini runs on your computer):

```bash
npm run try:errors
```

Settings in `.env` (all optional): `GEMINI_MODEL`, `GEMINI_BACKUP_MODEL`,
`PARSE_TIMEOUT_MS` (default 30000).

## Speed

Gemini's time depends mostly on how much it has to **write**, so we keep its answer short:

- **Line numbers:** text inputs are sent with numbered lines (`L12: ...`). Gemini answers
  `lines: [12]` instead of copying the text, and `parse.ts` copies line 12 into `sourceText`.
- **Empty fields left out:** Gemini skips `end` (one-day events), `location`, `description`
  and `recurrence` when empty; `parse.ts` fills them back in, so the `ParseResult` is complete.
- **Big inputs in parallel:** text with 60+ lines is cut into up to 3 pieces (between rows)
  that Gemini reads at the same time (`src/chunks.ts`). Each piece also gets the first lines
  and nearest table header as "context only", so it still knows the years and columns.
  If any piece fails, the whole parse fails with that piece's `AppError`.

Full UCSC page (153 events): ~40 s → 26 s (short answers) → **~12 s** (3 parallel pieces).
The server log prints `Gemini ok (...): N output tokens` for every call.

## Free-tier rate limit

The free tier allows **15 requests per minute per model**, shared by everyone using the same key.
A big text input (60+ lines) uses up to 3 requests, because it is split into parallel pieces.
Going over gives HTTP 429. Don't run two `try:` scripts back to back; wait a minute between them.

## CORS (who may call the server)

Browsers only let an extension read our replies if its origin is allowed. Allowed:
`chrome-extension://dclcclgfpcknfcfbehgedbnofmabmmoo` (our fixed dev ID from Lane 1's
manifest `key`), plus anything in `ALLOWED_ORIGINS` (comma-separated). Other websites get
403. Requests with no `Origin` (curl, test scripts) are allowed. CORS only stops *browsers*;
anyone can still call the URL with curl, so keep `--max-instances` low.

## Deploy to Cloud Run

You need: the Google Cloud CLI (`gcloud`) and a Google Cloud project **with billing enabled**
(Cloud Run requires it; small hackathon use should stay within the free tier).
Heads-up: if you enable billing on the *same* project as the Gemini key, Gemini calls move to
the paid tier (higher limits, small charges). Check the key's plan in AI Studio.

Run these from the `proxy/` folder, one at a time.

1. Install the CLI (macOS with Homebrew), then sign in and pick the project:
   ```bash
   brew install --cask google-cloud-sdk
   gcloud auth login
   gcloud config set project YOUR_PROJECT_ID
   ```
2. Turn on the services we use:
   ```bash
   gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com
   ```
3. Store the Gemini key in Secret Manager (read from `.env`, never typed or printed):
   ```bash
   grep '^GEMINI_API_KEY=' .env | cut -d= -f2- | tr -d '\n' | gcloud secrets create gemini-api-key --data-file=-
   ```
4. Let Cloud Run read that secret:
   ```bash
   PROJECT_NUMBER=$(gcloud projects describe "$(gcloud config get-value project)" --format='value(projectNumber)')
   gcloud secrets add-iam-policy-binding gemini-api-key --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" --role=roles/secretmanager.secretAccessor
   ```
5. Build and deploy (takes a few minutes; say yes if it asks to create a repository):
   ```bash
   gcloud run deploy calendar-proxy --source . --region us-west1 --allow-unauthenticated --set-secrets GEMINI_API_KEY=gemini-api-key:latest --max-instances 3 --memory 512Mi
   ```
6. Check it:
   ```bash
   URL=$(gcloud run services describe calendar-proxy --region us-west1 --format='value(status.url)')
   curl "$URL/health"
   PROXY_URL="$URL" npm run try:prompt
   ```

To update after code changes, run step 5 again. To change the key, add a new secret version
(`gcloud secrets versions add gemini-api-key --data-file=-`, same pipe as step 3) and redeploy.
Demo day: add `--min-instances 1` to step 5 so the first request isn't slow (costs a little).

Give Lane 1 the URL for `manifest.json`:
`"host_permissions": ["https://calendar-proxy-....run.app/*"]`

## Files

| File                  | What it does                                         |
|-----------------------|------------------------------------------------------|
| `src/server.ts`       | Express server and routes                            |
| `src/parse.ts`        | CaptureInput → Gemini message → cleaned ParseResult  |
| `src/inputs.ts`       | Text / files / images / image URLs → Gemini message  |
| `src/chunks.ts`       | Splits big text inputs into parallel pieces, merges answers |
| `src/gemini.ts`       | The one place that calls the Gemini REST API         |
| `src/prompt.ts`       | Rules we give Gemini (edit this to improve accuracy) |
| `src/schema.ts`       | JSON shape Gemini must reply with                    |
| `src/types.ts`        | Team handoff types (keep in sync with the contract)  |
| `src/errors.ts`       | `AppErrorException` → `AppError` replies             |
| `scripts/try-ucsc.ts` | Accuracy check against the fixture                   |
| `scripts/try-files.ts`| Checks PDFs, images, screenshots, URLs, .md files    |
| `scripts/try-prompt.ts`| Checks each prompt rule with small tricky inputs    |
| `scripts/try-errors.ts`| Checks every failure using a fake Gemini (no quota) |
