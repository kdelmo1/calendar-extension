# Lane 1: extension scaffold

## Files

- `../../manifest.json`: Chrome Manifest V3 settings.
- `../../vite.config.ts`: builds the worker and side panel, and copies the manifest into `dist/`.
- `../../package.json` and `../../tsconfig.json`: shared dependencies, commands, and TypeScript settings.
- `index.ts`: service worker; enables opening the panel from the toolbar icon.
- `../sidepanel/index.html` and `../sidepanel/main.tsx`: empty React entry point for Lane 4 to build on.

## Build and load

1. Run `npm install`, then `npm run build` from the repository root.
2. Open `chrome://extensions` in Chrome 116 or newer.
3. Turn on **Developer mode** and click **Load unpacked**.
4. Select this repository's **dist** folder (not the repository root).
5. Pin **Dates to Google Calendar** from Chrome's Extensions menu.
6. Click its toolbar icon. An empty side panel should open; it is intentionally blank until Lane 4 adds its UI.
7. On the extension card, click the service worker's **Inspect** link. Confirm there are no errors. An inactive worker after idle is normal.

For edits, run `npm run dev` to rebuild on changes. Click **Reload** on the extension card and reopen the panel after a rebuild. This uses local build output rather than a Vite development server.

## Stable development extension ID

`dclcclgfpcknfcfbehgedbnofmabmmoo`

The root manifest's `key` is a public key that makes every teammate's unpacked build use this ID. Commit and keep the same key; do not regenerate it on each machine. No private key is saved or needed for loading the unpacked extension.

Rebuild with `npm run build`, then remove the previously loaded extension and load `dist/` again in `chrome://extensions`. Check that the ID matches the value above. Removing the old extension clears its local extension data; the current scaffold has no saved user data. Reload once more and confirm the ID stays the same. Use this ID for the Google Cloud Chrome extension OAuth client in the next task.

Share with the team: "Our development Chrome extension ID is `dclcclgfpcknfcfbehgedbnofmabmmoo`. Use the committed manifest key and load the built `dist/` directory so we all have the same ID."

## Highlighted text capture

`context-menu.ts` registers **Add dates with Calibrate** for selected text. Clicking it opens the panel and sends `{ type: "CAPTURE_READY", payload: CaptureInput }`. The payload includes the selected text, page URL, and page title. `../capture/types.ts` defines the handoff type.

The worker starts saving `pendingCapture` and a new `pendingCaptureId` before opening the panel, without awaiting and losing the menu user gesture. The panel uses `watchCaptures` from `extension/sidepanel/captureDelivery.ts`: it subscribes to storage changes before its initial read and routes live messages through the same inbox. A synchronous in-memory ID check prevents duplicate parsing, and `handledCaptureId` in session storage prevents replay after reopening. A new click always gets a new ID, even for identical selected text. These IDs are internal session metadata; the runtime message and CaptureInput payload are unchanged. Do not independently remove pendingCapture in another listener.

### Test

1. Run `npm run build` and reload the extension in `chrome://extensions`.
2. On a normal web page, select text containing dates.
3. Right-click and choose **Add dates with Calibrate**. The panel should open (still empty until Lane 4 adds its UI).
4. Right-click inside the side panel, choose **Inspect**, and open the Console.
5. Run `chrome.storage.session.get("pendingCapture").then(console.log)`. Check `kind: "text"`, your selected text, `pageUrl`, and `pageTitle`.
6. In that same Console, run `chrome.runtime.onMessage.addListener(message => { if (message.type === "CAPTURE_READY") console.log(message); });`.
7. Highlight different text on the page and use the menu again. Check that the Console receives `CAPTURE_READY` with the new capture.

## Right-click image capture

The same **Add dates with Calibrate** menu appears when right-clicking an image. It sends `{ type: "CAPTURE_READY", payload: { kind: "image", imageUrl, pageUrl, pageTitle } }` and saves the same payload in `pendingCapture`. If text is selected while right-clicking an image, the clicked image takes priority. No MIME type is guessed from the URL.

Lane 2 receives the original image URL; fetching and parsing that image remain Lane 2's responsibility. A page-local `blob:` URL or an image requiring a signed-in browser session may not be accessible to the proxy. This capture feature does not download or convert images.

To test, rebuild and reload the extension, then right-click an image (such as a public event flyer) on a normal web page and choose the menu item. In the panel Console, run `chrome.storage.session.get("pendingCapture").then(console.log)`. Expect `kind: "image"`, the clicked image's `imageUrl`, and the page URL and title. Test highlighted text again afterward to confirm it still produces `kind: "text"`.

OAuth configuration, GET_TOKEN, highlighted text capture, and file/text helpers are implemented. Live Google sign-in must be tested in Chrome. See `../capture/README.md` for Lane 4 helper usage and testing.

## First-click capture regression checks

Run `node --test extension/sidepanel/captureDelivery.test.cjs`. Then reload the built extension, close the side panel, highlight dates on a normal page, and choose the Calibrate menu once. It should open directly into loading and then review. Repeat after closing/reopening and with the same selection; each deliberate click should start one parse.
