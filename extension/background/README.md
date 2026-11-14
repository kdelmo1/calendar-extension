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

Scaffold and stable development ID are implemented. OAuth, runtime messages, and capture helpers come in later Lane 1 tasks.
