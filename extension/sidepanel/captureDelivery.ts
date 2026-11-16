import type { CaptureInput } from "./types";

const CAPTURE_KEYS = ["pendingCapture", "pendingCaptureId", "handledCaptureId"];

// Storage is the durable inbox; the live message wakes it up if the panel is open.
export function watchCaptures(onCapture: (capture: CaptureInput) => void) {
  let active = true;
  const handled = new Set<string>();
  const storage = typeof chrome === "undefined" ? undefined : chrome.storage;

  async function receive(liveCapture?: CaptureInput) {
    let saved: Record<string, unknown> = {};
    try {
      if (storage?.session) saved = await storage.session.get(CAPTURE_KEYS);
    } catch {
      // A live capture can still work if session storage is unavailable.
    }
    if (!active) return;

    const pending = saved.pendingCapture as CaptureInput | undefined;
    const matchesLive = !liveCapture || JSON.stringify(pending) === JSON.stringify(liveCapture);
    if (pending && matchesLive) {
      const id = typeof saved.pendingCaptureId === "string"
        ? saved.pendingCaptureId
        : `legacy:${JSON.stringify(pending)}`;
      if (handled.has(id) || saved.handledCaptureId === id) return;
      // Mark synchronously before starting work: concurrent reads must not parse twice.
      handled.add(id);
      void storage?.session.set({ handledCaptureId: id }).catch(() => {});
      onCapture(pending);
    } else if (liveCapture) {
      // Keep accepting the agreed CAPTURE_READY payload from mocks/other senders.
      onCapture(liveCapture);
    }
  }

  function onStorageChanged(changes: Record<string, chrome.storage.StorageChange>, area: string) {
    if (area === "session" && (changes.pendingCapture || changes.pendingCaptureId)) {
      void receive();
    }
  }

  // Subscribe before reading so a capture saved during startup cannot be missed.
  storage?.onChanged?.addListener(onStorageChanged);
  void receive();

  return {
    receiveLive: (capture: CaptureInput) => receive(capture),
    dispose() {
      active = false;
      storage?.onChanged?.removeListener(onStorageChanged);
    },
  };
}
