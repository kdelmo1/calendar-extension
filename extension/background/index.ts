import { getToken } from "./auth";
import "./context-menu";

// Chrome opens the panel when the user clicks the extension's toolbar icon.
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {
  console.error({
    code: "PARSE_FAILED",
    message: "Could not enable the side panel. Reload the extension and try again.",
  });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "GET_TOKEN") return;

  void getToken().then(sendResponse);
  // Keep the response channel open while Google sign-in is pending.
  return true;
});

