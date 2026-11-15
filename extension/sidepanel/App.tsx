import { useEffect, useState } from "react";
import ErrorScreen from "./ErrorScreen";
import InputScreen from "./InputScreen";
import LoadingScreen from "./LoadingScreen";
import ReviewScreen from "./ReviewScreen";
import SuccessScreen from "./SuccessScreen";
import type {
  AppError,
  CaptureInput,
  Message,
  ParseResult,
  WriteResult,
} from "./types";
// Fake data from Lane 2's fixtures folder (repo root).
import fixture from "../../fixtures/ucsc-winter.json";

// JSON imports are typed loosely, so we tell TypeScript it's a ParseResult.
const fakeData = fixture as unknown as ParseResult;

// TEMPORARY flags. Set all three to false before the demo / once Lanes 2 and 3 merge.
const SHOW_DEMO_CONTROLS = true;
const USE_FAKE_BACKEND = true;
const SHOW_ERROR_TESTS = true;

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
  | { name: "success"; result: WriteResult }
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

// Send a message to the other lanes. Safe to call outside the extension.
function send(message: Message) {
  if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage) return;
  // catch: nobody is listening yet until the other lanes are merged.
  chrome.runtime.sendMessage(message).catch(() => {});
}

export default function App() {
  // The panel opens on the input screen.
  const [screen, setScreen] = useState<Screen>({ name: "input" });
  // The last events the user reviewed, so Undo and retries can use them.
  const [lastReviewed, setLastReviewed] = useState<ParseResult>(fakeData);
  // What the user last tried, so "Retry" knows what to repeat.
  const [lastInput, setLastInput] = useState<CaptureInput | null>(null);
  // Events that failed to write, for "Retry the failed events".
  const [failedIds, setFailedIds] = useState<string[]>([]);

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
    setScreen({ name: "success", result });
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

  // ---------- Error recovery ----------
  // What the recovery button does, depending on the error code.
  function recover(code: AppError["code"]) {
    if (code === "RATE_LIMIT" || code === "TIMEOUT") {
      // Repeat the last capture. If there is none, go to the input screen.
      if (lastInput) handleInputSubmit(lastInput);
      else setScreen({ name: "input" });
    } else if (code === "NO_DATES" || code === "PARSE_FAILED") {
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

  // Listen for messages from the other lanes.
  useEffect(() => {
    if (typeof chrome === "undefined" || !chrome.runtime?.onMessage) return;

    function listener(message: Message) {
      if (message.type === "CAPTURE_READY") startParsing(message.payload as CaptureInput);
      if (message.type === "PARSE_RESULT") handleParseResult(message.payload);
      if (message.type === "WRITE_RESULT") handleWriteResult(message.payload);
      if (message.type === "UNDO_RESULT") handleUndoResult(message.payload);
    }

    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  return (
    <main style={{ padding: 12, fontFamily: "sans-serif" }}>
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
          <h1 style={{ fontSize: 18 }}>Review your events</h1>
          {/* key makes React start fresh when new events arrive */}
          <ReviewScreen
            key={screen.data.calendarName + screen.data.events.length}
            initial={screen.data}
            onAdd={handleAdd}
          />
        </>
      )}

      {screen.name === "success" && (
        <SuccessScreen
          result={screen.result}
          onUndo={() => handleUndo(screen.result.calendarId)}
        />
      )}

      {screen.name === "undone" && (
        <div role="status">
          <h1 style={{ fontSize: 18 }}>Calendar removed</h1>
          <p>Nothing from this import is left in your Google Calendar.</p>
          <button
            type="button"
            onClick={() => setScreen({ name: "review", data: lastReviewed })}
          >
            Back to review
          </button>
        </div>
      )}

      {screen.name === "error" && (
        <ErrorScreen
          error={screen.error}
          onRecover={() => recover(screen.error.code)}
        />
      )}
    </main>
  );
}