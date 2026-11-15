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

`context-menu.ts` registers **Add dates to Google Calendar** for selected text. Clicking it opens the panel and sends `{ type: "CAPTURE_READY", payload: CaptureInput }`. The payload includes the selected text, page URL, and page title. `../capture/types.ts` defines the handoff type.

The latest capture is also saved to `chrome.storage.session` as `pendingCapture` before the message is sent. This avoids losing a selection if the panel has not mounted its message listener yet. Lane 4 should register its runtime listener, then read `pendingCapture` on mount as a fallback. Both paths should update the same capture state rather than start parsing independently; remove `pendingCapture` after consuming it so reopening the panel does not replay it. No panel screens are implemented by Lane 1.

### Test

1. Run `npm run build` and reload the extension in `chrome://extensions`.
2. On a normal web page, select text containing dates.
3. Right-click and choose **Add dates to Google Calendar**. The panel should open (still empty until Lane 4 adds its UI).
4. Right-click inside the side panel, choose **Inspect**, and open the Console.
5. Run `chrome.storage.session.get("pendingCapture").then(console.log)`. Check `kind: "text"`, your selected text, `pageUrl`, and `pageTitle`.
6. In that same Console, run `chrome.runtime.onMessage.addListener(message => { if (message.type === "CAPTURE_READY") console.log(message); });`.
7. Highlight different text on the page and use the menu again. Check that the Console receives `CAPTURE_READY` with the new capture.

OAuth configuration, GET_TOKEN, highlighted text capture, and file/text helpers are implemented. Live Google sign-in must be tested in Chrome. See `../capture/README.md` for Lane 4 helper usage and testing.
