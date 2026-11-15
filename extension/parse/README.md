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

## Files

| File               | What it does                                                     |
|--------------------|------------------------------------------------------------------|
| `index.ts`         | Listens for `PARSE_REQUEST`, sends `PARSE_RESULT`                |
| `client.ts`        | Calls the server; turns every failure into an `AppError`         |
| `types.ts`         | Team handoff types (same as `proxy/src/types.ts`)                |
| `try-handler.ts`   | Test with a fake `chrome` (not part of the extension)            |

## Using a local server

Create `.env.local` in the repo root with `VITE_PROXY_URL=http://localhost:8080`,
run `npm run dev` in `proxy/`, and rebuild the extension. Delete the file to go back to Cloud Run.

## Testing without Chrome

```bash
cd proxy && npx tsx ../extension/parse/try-handler.ts
```

Sends a real request through Cloud Run and checks the failure cases (server down,
timeout, bad answer). Should end with `6/6 cases passed.`
