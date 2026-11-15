import { useEffect, useRef, useState } from "react";
import ErrorScreen from "./ErrorScreen";
import GlobalStyles from "./GlobalStyles";
import InputScreen from "./InputScreen";
import LoadingScreen from "./LoadingScreen";
import ReviewScreen from "./ReviewScreen";
import SuccessScreen from "./SuccessScreen";
import Header from "./Header";
import type {
  AppError,
  CaptureInput,
  EditRequest,
  EditResult,
  Message,
  ParseResult,
  WriteResult,
} from "./types";
// Fake data from Lane 2's fixtures folder (repo root). Only used by the dev buttons.
import fixture from "../../fixtures/ucsc-winter.json";

// JSON imports are typed loosely, so we tell TypeScript it's a ParseResult.
const fakeData = fixture as unknown as ParseResult;

// Development switches. All false = the real extension.
// Keep SHOW_DEMO_CONTROLS off when testing real writes: "Show sample review"
// would let you add FAKE events to your real Google Calendar.
const SHOW_DEMO_CONTROLS = false;
const SHOW_ERROR_TESTS = false;
const USE_FAKE_BACKEND = false; // fakes Lane 2 parse + Lane 3 write/undo replies
const USE_FAKE_EDIT = false; // fakes Lane 2 plain-English edit replies

const ERROR_CODES: AppError["code"][] = [
  "NO_DATES",
  "PARSE_FAILED",
  "RATE_LIMIT",
  "TIMEOUT",
  "AUTH_DENIED",
  "PARTIAL_WRITE",
  "CALENDAR_ERROR",
];

// Which screen is showing right now.
type Screen =
  | { name: "input" }
  | { name: "loading"; message: string }
  | { name: "review"; data: ParseResult }
  | { name: "success"; result: WriteResult; submitted: ParseResult | null }
  | { name: "undone" }
  | { name: "error"; error: AppError };

// A message payload is either good data or an AppError.
function isAppError(x: unknown): x is AppError {
  return typeof x === "object" && x !== null && "code" in x && "message" in x;
}

// Say what we are reading, based on what the user gave us.
function loadingText(input: CaptureInput): string {
  if (input.kind === "text") return "Reading selected text…";
  if (input.kind === "image") return "Reading image…";
  if (input.kind === "screenshot") return "Reading screenshot…";
  return "Reading file…";
}

// What a screen reader should hear when the screen changes.
function announce(screen: Screen): string {
  switch (screen.name) {
    case "input":
      return "Add your dates.";
    case "loading":
      return screen.message;
    case "review":
      return `Review your events. ${screen.data.events.length} events found.`;
    case "success":
      return `Added ${screen.result.added} events.`;
    case "undone":
      return "Calendar removed.";
    case "error":
      return screen.error.message;
  }
}

// Send a message to the other lanes. Safe to call outside the extension.
function send(message: Message) {
  if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage) return;
  // catch: nobody is listening (for example before the service worker wakes up).
  chrome.runtime.sendMessage(message).catch(() => {});
}

// Forget the capture Lane 1 saved for us, so it can't start twice.
function clearPendingCapture() {
  if (typeof chrome === "undefined" || !chrome.storage?.session) return;
  chrome.storage.session.remove("pendingCapture").catch(() => {});
}

// TEMPORARY fake for testing plain-English edits without Lane 2.
function fakeEdit(req: EditRequest): EditResult {
  const base = {
    calendarName: req.calendarName ?? "",
    timeZone: req.timeZone ?? "",
  };
  // Only understands "final", to match the test phrase.
  if (!req.instruction.toLowerCase().includes("final")) {
    return {
      result: { ...base, events: req.events },
      summary: "Which event do you mean?",
    };
  }
  const events = req.events.map((e) =>
    e.title.includes("Final")
      ? { ...e, start: "2027-03-16", end: "2027-03-20", confidence: 0.95 }
      : e
  );
  return {
    result: { ...base, events },
    summary: 'Updated 1 event: "Final Examinations".',
  };
}

export default function App() {
  // The panel opens on the input screen.
  const [screen, setScreen] = useState<Screen>({ name: "input" });
  // The last events the user reviewed. null until real events exist, so a retry
  // can never write fake events to someone's real calendar.
  const [lastReviewed, setLastReviewed] = useState<ParseResult | null>(null);
  // Keep the exact write attempt available to the long-lived result listener.
  const writeAttempt = useRef<ParseResult | null>(null);
  // What the user last tried, so "Retry" knows what to repeat.
  const [lastInput, setLastInput] = useState<CaptureInput | null>(null);
  // Events that failed to write, for "Retry the failed events".
  const [failedIds, setFailedIds] = useState<string[]>([]);

  // Plain-English edits (optional feature).
  const [editBusy, setEditBusy] = useState(false);
  const [editNote, setEditNote] = useState<{ text: string; isError: boolean } | null>(null);
  const [editReplacement, setEditReplacement] = useState<{ result: ParseResult; n: number } | null>(null);
  const editTimer = useRef<number | undefined>(undefined);

  // The capture we started from storage, so a live message for it is ignored.
  const startedFromStorage = useRef<string | null>(null);

  // After loading, keyboard focus would be lost. Put it on the review heading.
  const reviewHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (screen.name === "review") reviewHeading.current?.focus();
  }, [screen.name]);

  // ---------- Parsing (Lane 2) ----------
  function startParsing(input: CaptureInput) {
    setLastInput(input);
    setScreen({ name: "loading", message: loadingText(input) });
    send({ type: "PARSE_REQUEST", payload: input });
  }

  // Show "Found N dates" for a moment, then the review screen.
  function handleParseResult(payload: unknown) {
    if (isAppError(payload)) {
      setScreen({ name: "error", error: payload });
      return;
    }
    const result = payload as ParseResult;
    // Lane 2 sent something unusable, or found nothing.
    if (!result || !Array.isArray(result.events) || result.events.length === 0) {
      setScreen({
        name: "error",
        error: { code: "NO_DATES", message: "We couldn't find any dates in that." },
      });
      return;
    }
    setLastReviewed(result); // so Undo and retries use the parsed events
    setEditNote(null); // clear any message from an earlier edit
    setScreen({ name: "loading", message: `Found ${result.events.length} dates` });
    setTimeout(() => setScreen({ name: "review", data: result }), 1200);
  }

  // The user gave us something on the input screen.
  function handleInputSubmit(input: CaptureInput) {
    startParsing(input);
    if (USE_FAKE_BACKEND) {
      // Pretend Lane 2 answered after 2 seconds.
      setTimeout(() => handleParseResult(fakeData), 2000);
    }
  }

  // ---------- Writing (Lane 3) ----------
  // User clicked "Add to Google Calendar": remember what they reviewed, then send.
  function handleAdd(result: ParseResult) {
    setLastReviewed(result);
    sendWrite(result);
  }

  // Sends events to Lane 3 (and fakes the reply while USE_FAKE_BACKEND is on).
  function sendWrite(result: ParseResult) {
    writeAttempt.current = result;
    setScreen({ name: "loading", message: "Creating your calendar…" });
    send({ type: "WRITE_REQUEST", payload: result });

    if (USE_FAKE_BACKEND) {
      // Pretend Lane 3 answered after 1.5 seconds.
      setTimeout(() => {
        handleWriteResult({
          calendarId: "fake-calendar-id",
          calendarLink: "https://calendar.google.com/calendar/u/0/r",
          added: result.events.length,
          failed: [],
        });
      }, 1500);
    }
  }

  function handleWriteResult(payload: unknown) {
    if (isAppError(payload)) {
      setScreen({ name: "error", error: payload });
      return;
    }
    const result = payload as WriteResult;
    // Remember which events failed, in case the user retries them.
    setFailedIds((result.failed ?? []).map((f) => f.eventId));
    setScreen({ name: "success", result, submitted: writeAttempt.current });
  }

  // ---------- Undo (Lane 3) ----------
  function handleUndo(calendarId: string) {
    setScreen({ name: "loading", message: "Removing calendar…" });
    send({ type: "UNDO_REQUEST", payload: { calendarId } });

    if (USE_FAKE_BACKEND) {
      setTimeout(() => handleUndoResult({ ok: true }), 1000);
    }
  }

  function handleUndoResult(payload: unknown) {
    if (isAppError(payload)) {
      setScreen({ name: "error", error: payload });
      return;
    }
    setScreen({ name: "undone" });
  }

  // ---------- Plain-English edits (Lane 2, optional) ----------
  function handleEditRequest(request: EditRequest) {
    setEditBusy(true);
    setEditNote(null);
    // If no answer comes back, don't leave the button stuck forever.
    window.clearTimeout(editTimer.current);
    editTimer.current = window.setTimeout(() => {
      setEditBusy(false);
      setEditNote({ text: "That took too long. Try again.", isError: true });
    }, 30000);

    send({ type: "EDIT_REQUEST", payload: request });

    if (USE_FAKE_EDIT) {
      setTimeout(() => handleEditResult(fakeEdit(request)), 1000);
    }
  }

  function handleEditResult(payload: unknown) {
    window.clearTimeout(editTimer.current);
    setEditBusy(false);
    if (isAppError(payload)) {
      setEditNote({ text: payload.message, isError: true });
      return;
    }
    const p = payload as EditResult;
    // A full ParseResult: the review screen REPLACES its list with it.
    setEditReplacement({ result: p.result, n: Date.now() });
    setEditNote({ text: p.summary, isError: false });
  }

  // ---------- Error recovery ----------
  // What the recovery button does, depending on the error code.
  function goHome() {
    setEditNote(null);
    setScreen({ name: "input" });
  }

  function recover(code: AppError["code"]) {
    if (code === "RATE_LIMIT" || code === "TIMEOUT") {
      // Repeat the last capture. If there is none, go to the input screen.
      if (lastInput) handleInputSubmit(lastInput);
      else setScreen({ name: "input" });
    } else if (code === "NO_DATES" || code === "PARSE_FAILED") {
      setScreen({ name: "input" });
    } else if (!lastReviewed) {
      // Nothing real to write again.
      setScreen({ name: "input" });
    } else if (code === "PARTIAL_WRITE") {
      // Nothing to retry? Go back to the review screen.
      if (failedIds.length === 0) {
        setScreen({ name: "review", data: lastReviewed });
        return;
      }
      // Send only the failed events, without overwriting lastReviewed.
      sendWrite({
        ...lastReviewed,
        events: lastReviewed.events.filter((e) => failedIds.includes(e.id)),
      });
    } else {
      // AUTH_DENIED and CALENDAR_ERROR: send the last write again.
      sendWrite(lastReviewed);
    }
  }

  // When the panel opens, pick up a capture that Lane 1 saved for us.
  // (The live CAPTURE_READY message can arrive before this panel is ready.)
  useEffect(() => {
    if (typeof chrome === "undefined" || !chrome.storage?.session) return;
    chrome.storage.session
      .get("pendingCapture")
      .then(({ pendingCapture }) => {
        if (!pendingCapture) return;
        clearPendingCapture();
        const input = pendingCapture as CaptureInput;
        startedFromStorage.current = JSON.stringify(input);
        handleInputSubmit(input);
      })
      .catch(() => {});
  }, []);

  // Listen for messages from the other lanes.
  useEffect(() => {
    if (typeof chrome === "undefined" || !chrome.runtime?.onMessage) return;

    function listener(message: Message) {
      if (message.type === "CAPTURE_READY") {
        clearPendingCapture();
        // Same capture we already started from storage? Don't start it twice.
        if (startedFromStorage.current === JSON.stringify(message.payload)) {
          startedFromStorage.current = null;
          return;
        }
        startParsing(message.payload as CaptureInput);
      }
      if (message.type === "PARSE_RESULT") handleParseResult(message.payload);
      if (message.type === "WRITE_RESULT") handleWriteResult(message.payload);
      if (message.type === "UNDO_RESULT") handleUndoResult(message.payload);
      if (message.type === "EDIT_RESULT") handleEditResult(message.payload);
    }

    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  return (
    <>
      <GlobalStyles />
      <main className="app">
        <Header
          onHome={screen.name === "input" ? undefined : goHome}
          className={screen.name === "input" ? "theme-toolbar theme-toolbar-input" : "theme-toolbar"}
        />
        {/* Always on the page, so changes are announced reliably. */}
        <div className="sr-only" aria-live="polite" aria-atomic="true">
          {announce(screen)}
        </div>

        {SHOW_DEMO_CONTROLS && (
          <div style={{ marginBottom: 12 }}>
            <button
              type="button"
              style={{ marginRight: 4 }}
              onClick={() => handleInputSubmit({ kind: "text", text: "fake" })}
            >
              Simulate: capture, then result
            </button>
            <button
              type="button"
              onClick={() => setScreen({ name: "review", data: fakeData })}
            >
              Show sample review
            </button>
          </div>
        )}

        {SHOW_ERROR_TESTS && (
          <div style={{ marginBottom: 12 }}>
            <p style={{ margin: "0 0 4px" }}>Test errors:</p>
            {ERROR_CODES.map((code) => (
              <button
                key={code}
                type="button"
                style={{ marginRight: 4, marginBottom: 4 }}
                onClick={() =>
                  setScreen({
                    name: "error",
                    error: { code, message: `Fake ${code} message for testing.` },
                  })
                }
              >
                {code}
              </button>
            ))}
          </div>
        )}

        {screen.name === "input" && <InputScreen onSubmit={handleInputSubmit} />}

        {screen.name === "loading" && <LoadingScreen message={screen.message} />}

        {screen.name === "review" && (
          <>
            <h1 ref={reviewHeading} tabIndex={-1} style={{ fontSize: 18 }}>
              Review your events
            </h1>
            {/* key makes React start fresh when new events arrive */}
            <ReviewScreen
              key={screen.data.calendarName + screen.data.events.length}
              initial={screen.data}
              onAdd={handleAdd}
              onEdit={handleEditRequest}
              editBusy={editBusy}
              editNote={editNote}
              replacement={editReplacement}
            />
          </>
        )}

        {screen.name === "success" && (
          <SuccessScreen
            result={screen.result}
            submitted={screen.submitted}
            onUndo={() => handleUndo(screen.result.calendarId)}
            onConvertMore={goHome}
          />
        )}

        {screen.name === "undone" && (
          <div>
            <h1 style={{ fontSize: 18 }}>Calendar removed</h1>
            <p>Nothing from this import is left in your Google Calendar.</p>
              <div className="result-actions">
                {lastReviewed ? (
                  <>
                    <button
                      type="button"
                      className="primary"
                      onClick={goHome}
                    >
                      Convert more
                    </button>

                    <button
                      type="button"
                      onClick={() => setScreen({ name: "review", data: lastReviewed })}
                    >
                      Back to review
                    </button>
                  </>
                ) : (
                  <button type="button" className="primary" onClick={goHome}>
                    Start over
                  </button>
                )}
            </div>
          </div>
        )}

        {screen.name === "error" && (
          <ErrorScreen
            error={screen.error}
            onRecover={() => recover(screen.error.code)}
            onBack={
              lastReviewed
                ? () => setScreen({ name: "review", data: lastReviewed })
                : undefined
            }
          />
        )}
      </main>
    </>
  );
}
