# Lane 1 capture helpers: ready for Lane 4

Import from `extension/capture/index.ts` (from the side panel, use `../capture`). These helpers do not call Gemini or Google Calendar.

```ts
import { fileToCaptureInput, textToCaptureInput } from "../capture";

const input = textToCaptureInput("Final exam: March 15, 2027");
// For a file input or clipboard File:
// const input = await fileToCaptureInput(file);

if ("code" in input) {
  // Show input.message in the UI; input is an AppError.
} else {
  // input is exactly CaptureInput, ready for the agreed message.
  chrome.runtime.sendMessage({ type: "PARSE_REQUEST", payload: input });
}
```

- `textToCaptureInput(text)` returns `CaptureInput | AppError` synchronously. It trims surrounding whitespace and rejects empty text with `NO_DATES`. It does not check whether nonempty text has dates; Lane 2 handles that.
- `fileToCaptureInput(file)` returns `Promise<CaptureInput | AppError>`. It supports PDF, TXT, MD/Markdown, PNG, JPEG, and WebP. All uploads use `kind: "file"`, including image uploads. The resulting base64 has no `data:` prefix and preserves the file's bytes, including Unicode text encoded in the file.
- Empty files return `NO_DATES`; unsupported types and read failures return `PARSE_FAILED`. MIME type comes from the file, with a filename fallback for missing or generic `application/octet-stream` types.
- `CaptureInput` is exported from `index.ts` and defined in `types.ts`. Page metadata is optional and can be added by the caller when relevant.

## Test without changing Lane 4's UI

Run this from the repository root to create a temporary browser-test build using the same helpers:

```sh
./node_modules/.bin/esbuild extension/capture/index.ts --bundle --format=iife --global-name=CaptureHelpers --outfile=/tmp/calendar-capture-helpers.js
```

Open `/tmp/calendar-capture-helpers.js` in a text editor and copy its contents into the extension side panel's DevTools Console. It defines `CaptureHelpers` only for this DevTools session. Then run:

```js
CaptureHelpers.textToCaptureInput("Exam: March 15, 2027")
// { kind: "text", text: "Exam: March 15, 2027" }

CaptureHelpers.textToCaptureInput("   ")
// { code: "NO_DATES", message: ... }

const result = await CaptureHelpers.fileToCaptureInput(
  new File(["Exam: March 15, 2027"], "dates.txt", { type: "text/plain" })
);
console.log(result);
// kind: "file", mimeType: "text/plain", fileBase64 without a data: prefix
console.log(atob(result.fileBase64));
// Exam: March 15, 2027
```

The temporary build is for manual testing only. Lane 4 imports the TypeScript helpers directly into its UI.
