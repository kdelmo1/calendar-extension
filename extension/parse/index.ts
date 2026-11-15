// Lane 2: handles PARSE_REQUEST in the extension's service worker.
//
//   Side panel (Lane 4) --PARSE_REQUEST { CaptureInput }-->  this file
//   this file --POST /parse-->  our server (proxy/) --> Gemini
//   this file --PARSE_RESULT { ParseResult | AppError }-->  side panel
//
// To turn it on, Lane 1 adds ONE line to extension/background/index.ts:
//   import "../parse";
// (Just importing this file registers the listener, like "./context-menu".)

import { parseOnServer } from "./client";
import type { CaptureInput } from "./types";

type ParseRequest = { type: "PARSE_REQUEST"; payload: CaptureInput };

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if ((message as ParseRequest)?.type !== "PARSE_REQUEST") return; // not ours: let other listeners answer

  void handleParseRequest((message as ParseRequest).payload).then(sendResponse);
  // true = "I will answer later" (keeps sendResponse working after the await)
  return true;
});

async function handleParseRequest(input: CaptureInput) {
  const payload = await parseOnServer(input);

  // Send the answer to the side panel as its own message (the team contract).
  // If the panel was closed meanwhile, nobody is listening: that's fine, ignore it.
  try {
    await chrome.runtime.sendMessage({ type: "PARSE_RESULT", payload });
  } catch {
    // no receiver
  }

  // Also return it to whoever sent PARSE_REQUEST, for code that prefers
  // `const result = await chrome.runtime.sendMessage({ type: "PARSE_REQUEST", ... })`.
  return payload;
}
