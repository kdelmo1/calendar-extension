# Calibrate

**Turn any schedule into Google Calendar events: highlighted text, a flyer, a screenshot, or a PDF.**
Calibrate is a Chrome extension that uses Google Gemini to read dates from whatever you're looking
at, lets you review and fix them in a side panel, and adds them to Google Calendar in one click.

<!-- TODO after the UI freeze: add a screenshot or GIF of the side panel here -->

## What it does

1. **Capture**: right-click highlighted text or an image, or open the panel to upload a
   PDF / image / text file or take a screenshot of the page.
2. **Read**: Gemini finds every date, time, range, and repeating class meeting, and turns them into events.
3. **Review**: events Gemini wasn't sure about (e.g. no year given) are listed under **Check these**;
   the rest under **Looks good**. Edit any field, or type a change in plain English:
   *"delete all the holidays"*, *"move the midterm to Friday"*.
4. **Add**: events go into a **new, separate calendar** in your Google account, with one-click **Undo**.

## How we use Gemini

| Feature | Gemini API capability | Where |
|---|---|---|
| Messy input → clean events | **Structured output** (`responseSchema`): Gemini must answer in our exact event format: title, dates, all-day, time zone, category, repeat rule (RRULE), confidence | `proxy/src/schema.ts`, `proxy/src/prompt.ts` |
| Text, PDFs, images, screenshots | **Multimodal input**: files and images are sent to Gemini directly (no separate OCR step) | `proxy/src/inputs.ts` |
| "Move the midterm to Friday" | **Function calling**: Gemini picks `update_events`, `delete_events` (with date/category filters), or `add_events`; our code applies them | `proxy/src/edit.ts` |
| Long pages in seconds | **Parallel requests**: big inputs are split into up to 3 chunks read at the same time (full UCSC calendar page: 40 s → ~12 s) | `proxy/src/chunks.ts` |
| Honest confidence | Gemini reports *where* each year came from and whether it was unsure; our code caps the confidence of guesses so they get flagged for review | `proxy/src/parse.ts` |
| Reliability | Retries when Gemini is busy, a backup model (`gemini-3.5-flash`) on rate limits, a 30 s time limit, and clear error messages | `proxy/src/gemini.ts` |

Model: `gemini-3.5-flash-lite` (fast and cheap), with `gemini-3.5-flash` as the backup.

**Results on our test set:** 9 of 10 messy real-world inputs (university calendars, syllabi, flyers,
screenshots) fully correct; 153 events from the UCSC academic calendar page; a short highlight
takes ~1.5 s, a plain-English edit ~1 s.

## How it works

```
Chrome extension (MV3)                                Google Cloud
┌──────────────────────────────────────┐             ┌──────────────────────────┐
│ Right-click / upload / screenshot    │             │ Cloud Run server (proxy/)│
│        │                             │  POST /parse│   prompt + schema        │
│        ▼                             │────────────▶│        │                 │
│ Side panel (review, edit) ◀──────────│◀────────────│        ▼                 │
│        │                             │  POST /edit │   Gemini API             │
│        ▼                             │             │   (key in Secret Manager)│
│ Google Calendar API (OAuth)          │             └──────────────────────────┘
│   new calendar + events, Undo        │
└──────────────────────────────────────┘
```

- The **Gemini API key never ships in the extension.** It lives in Secret Manager and is used only
  by our Cloud Run server, which accepts requests from our extension only (CORS allow-list).
- Calendar access uses Chrome's built-in Google sign-in (`chrome.identity`).
- Events go into their own calendar, so nothing touches your existing events, and Undo deletes it.
- The 3 demo inputs have saved results built in, so the demo still works offline.

## Run it yourself

```bash
npm install
npm run build
```

Then open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked**, and pick the
`dist/` folder. Pin Calibrate, highlight some dates on any page, right-click → **Add dates with Calibrate**.

The extension uses our deployed server by default. To run the server yourself, see
[`proxy/README.md`](proxy/README.md) (Node 20+, a Gemini API key in `proxy/.env`).

## Project layout

| Lane | Folder | What it does | Owner |
|---|---|---|---|
| 1 Shell + capture | `extension/background`, `extension/capture`, `manifest.json` | Right-click menu, screenshots, Google sign-in | Wen |
| 2 Gemini + server | `proxy/`, `extension/parse`, `fixtures/` | Cloud Run server, prompts, schema, edits, tests | Kyle |
| 3 Calendar writer | `extension/calendar` | Creates the calendar, adds events, Undo | Angelica |
| 4 UI + demo | `extension/sidepanel`, `demo/` | Side panel: input, review, edit, success screens | Belinda |

Each folder has its own README with details.

## Built with

Google Gemini API · Google Cloud Run · Secret Manager · Google Calendar API · Chrome Extensions (MV3) ·
TypeScript · React · Vite · Express

Built at Google DevFest 2026 @ UCSC.
