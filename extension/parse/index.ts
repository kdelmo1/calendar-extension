// Lane 2: handles PARSE_REQUEST and EDIT_REQUEST in the extension's service worker.
//
//   Side panel (Lane 4) --PARSE_REQUEST { CaptureInput }-->  this file
//   this file --POST /parse-->  our server (proxy/) --> Gemini
//   this file --PARSE_RESULT { ParseResult | AppError }-->  side panel
//
//   Side panel (Lane 4) --EDIT_REQUEST { events, instruction }-->  this file
//   this file --POST /edit-->  our server --> Gemini function calling
//   this file --EDIT_RESULT { result: ParseResult, summary } | AppError-->  side panel
//
// To turn it on, Lane 1 adds ONE line to extension/background/index.ts:
//   import "../parse";
// (Just importing this file registers the listener, like "./context-menu".)

import { editOnServer, parseOnServer } from "./client";
import type { CaptureInput, EditRequest } from "./types";

type Request =
  | { type: "PARSE_REQUEST"; payload: CaptureInput }
  | { type: "EDIT_REQUEST"; payload: EditRequest };

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const request = message as Request;
  if (request?.type === "PARSE_REQUEST") {
    void answer("PARSE_RESULT", parseOnServer(request.payload)).then(sendResponse);
    return true; // true = "I will answer later" (keeps sendResponse working after the await)
  }
  if (request?.type === "EDIT_REQUEST") {
    void answer("EDIT_RESULT", editOnServer(request.payload)).then(sendResponse);
    return true;
  }
  // not ours: let other listeners answer
});

async function answer(type: "PARSE_RESULT" | "EDIT_RESULT", work: Promise<unknown>) {
  const payload = await work;

  // Send the answer to the side panel as its own message (the team contract).
  // If the panel was closed meanwhile, nobody is listening: that's fine, ignore it.
  try {
    await chrome.runtime.sendMessage({ type, payload });
  } catch {
    // no receiver
  }

  // Also return it to whoever sent the request, for code that prefers
  // `const result = await chrome.runtime.sendMessage({ type: "EDIT_REQUEST", ... })`.
  return payload;
}
