import type { CaptureInput } from "../capture/types";
import type { AppError } from "./auth";

const MENU_ID = "add-selected-dates";

function reportError(message: string, code: AppError["code"] = "PARSE_FAILED") {
  const error: AppError = { code, message };
  console.error(error);
}

chrome.runtime.onInstalled.addListener(() => {
  // Chrome keeps menus across worker restarts. Recreate only on install/update.
  chrome.contextMenus.removeAll(() => {
    if (chrome.runtime.lastError) {
      reportError("Could not prepare the dates menu. Reload the extension and try again.");
      return;
    }
    chrome.contextMenus.create(
      {
        id: MENU_ID,
        title: "Add dates to Google Calendar",
        contexts: ["selection", "image"],
      },
      () => {
        if (chrome.runtime.lastError) {
          reportError("Could not create the dates menu. Reload the extension and try again.");
        }
      },
    );
  });
});

async function sendCapture(capture: CaptureInput) {
  // Save first: the panel's React listener may still be mounting on first open.
  await chrome.storage.session.set({ pendingCapture: capture });
  try {
    await chrome.runtime.sendMessage({ type: "CAPTURE_READY", payload: capture });
  } catch {
    // Lane 4 reads pendingCapture on mount if it missed the live message.
  }
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== MENU_ID) return;

  if (tab?.windowId === undefined) {
    reportError("Could not find the browser window. Try again on a web page.");
    return;
  }

  let capture: CaptureInput;
  if (info.mediaType === "image") {
    if (!info.srcUrl) {
      reportError("Could not read this image's URL. Try another image.");
      return;
    }
    // Prefer the clicked image even if the page also has highlighted text.
    capture = { kind: "image", imageUrl: info.srcUrl };
  } else {
    const text = info.selectionText?.trim();
    if (!text) {
      reportError("Highlight some text containing dates, then try again.", "NO_DATES");
      return;
    }
    capture = { kind: "text", text };
  }
  capture.pageUrl = info.pageUrl ?? tab.url;
  capture.pageTitle = tab.title;

  // Call open immediately, while Chrome still recognizes the menu user gesture.
  void chrome.sidePanel.open({ windowId: tab.windowId })
    .then(() => sendCapture(capture))
    .catch(() => {
      reportError("Could not open the dates panel or save the capture. Please try again.");
    });
});
