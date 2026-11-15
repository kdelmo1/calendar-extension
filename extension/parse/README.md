# extension/parse/ — Lane 2 (extension side)

Runs in the extension's service worker. Handles `PARSE_REQUEST`, calls our server
(`proxy/`, deployed on Cloud Run), and sends back `PARSE_RESULT`.

```
Side panel (Lane 4) --PARSE_REQUEST { CaptureInput }--> extension/parse
extension/parse     --POST /parse-->                     Cloud Run server --> Gemini
extension/parse     --PARSE_RESULT { ParseResult | AppError }--> side panel
```

## Turning it on (Lane 1)

Add one line to `extension/background/index.ts`, next to `import "./context-menu";`:

```ts
import "../parse";
```

No manifest change is needed: the server allows our extension's origin
(`chrome-extension://dclcclgfpcknfcfbehgedbnofmabmmoo`) through CORS.

## Using it (Lane 4)

Either style works:

```ts
// 1. Fire and forget, then listen for PARSE_RESULT (the team contract)
chrome.runtime.sendMessage({ type: "PARSE_REQUEST", payload: captureInput });

// 2. Or wait for the answer directly
const payload = await chrome.runtime.sendMessage({ type: "PARSE_REQUEST", payload: captureInput });
```

`payload` is a `ParseResult`, or an `AppError` (`{ code, message }`) whose `message`
is ready to show the user. Possible codes: `NO_DATES`, `RATE_LIMIT`, `TIMEOUT`, `PARSE_FAILED`.
Big inputs can take up to ~30 s; the extension gives up after 40 s with `TIMEOUT`.

## Demo backups (task 10)

`backups/` holds saved results for the 3 demo inputs. Each one passed its answer key when
saved. They ship inside the extension, so they work with no internet at all.

| Demo input | File to use | Recognised by |
|---|---|---|
| UCSC key dates (highlight the page) | registrar.ucsc.edu/calendar | the text contains "Instruction Begins", "Final Examinations", "Winter 2027", "Quarter Ends" |
| Forum flyer (image) | `fixtures/real/Forum(English).png` | exact file bytes, or an image URL containing `Forum(English)` |
| UC San Diego calendar (PDF) | `fixtures/real/2026-2027-AcadAdmin-Calendar.pdf` | exact file bytes |

When it kicks in (demo inputs only; every other input behaves normally):
- **Offline** → saved result right away.
- **Online** → the live server is used. If it hasn't answered after **20 s**, or returns any error
  except `NO_DATES` (timeout, rate limit, Gemini busy...), the saved result is used instead.
- The service worker console logs `[parse] Using saved demo result "..." (reason)` when it happens.

On stage, use **these exact files** (a re-saved or re-screenshotted copy has different bytes and
won't be recognised). Note: the backups only cover *reading* the dates. Adding them to Google
Calendar (Lane 3) still needs the internet.

To refresh the backups after a prompt change (uses Cloud Run, ~1 minute):

```bash
cd proxy && npm run save:demo
```

## Files

| File               | What it does                                                     |
|--------------------|------------------------------------------------------------------|
| `index.ts`         | Listens for `PARSE_REQUEST`, sends `PARSE_RESULT`                |
| `client.ts`        | Calls the server; turns every failure into an `AppError`         |
| `types.ts`         | Team handoff types (same as `proxy/src/types.ts`)                |
| `backups.ts`       | Recognises the 3 demo inputs and returns their saved results     |
| `backups/*.json`   | The saved results (made by `npm run save:demo` in `proxy/`)      |
| `try-handler.ts`   | Test with a fake `chrome` (not part of the extension)            |

## Using a local server

Create `.env.local` in the repo root with `VITE_PROXY_URL=http://localhost:8080`,
run `npm run dev` in `proxy/`, and rebuild the extension. Delete the file to go back to Cloud Run.

## Testing without Chrome

```bash
cd proxy && npx tsx ../extension/parse/try-handler.ts
```

Sends a real request through Cloud Run and checks the failure cases (server down,
timeout, bad answer) and the demo backups (server down, offline, not a demo input, server up).
Should end with `14/14 cases passed.`
