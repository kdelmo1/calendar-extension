import { useEffect, useState } from "react";
import LoadingScreen from "./LoadingScreen";
import ReviewScreen from "./ReviewScreen";
import SuccessScreen from "./SuccessScreen";
import ErrorScreen from "./ErrorScreen";
import type { AppError, CaptureInput, Message, ParseResult, WriteResult } from "./types";
// Fake data from Lane 2's fixtures folder (repo root).
import fixture from "../../fixtures/ucsc-winter.json";

// JSON imports are typed loosely, so we tell TypeScript it's a ParseResult.
const fakeData = fixture as unknown as ParseResult;

const SHOW_DEMO_CONTROLS = true;

const USE_FAKE_BACKEND = true;

const SHOW_ERROR_TESTS = true;

const ERROR_CODES: AppError["code"][] = [
  "NO_DATES", "PARSE_FAILED", "RATE_LIMIT", "TIMEOUT",
  "AUTH_DENIED", "PARTIAL_WRITE", "CALENDAR_ERROR",
];

type Screen = 
  | { name: "loading"; message: string }
  | { name: "review"; data: ParseResult }
  | { name: "success"; result: WriteResult }
  | { name: "undone" }
  | { name: "error"; error:AppError };
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
  // catch: nobody is listening yet until Lanes 1 and 2 are merged.
  chrome.runtime.sendMessage(message).catch(() => {});
}

export default function App() {
  // Start on the review screen with fake data, as before.
  const [screen, setScreen] = useState<Screen>({ name: "review", data: fakeData });

  const [lastReviewed, setLastReviewed] = useState<ParseResult>(fakeData);
  
  const [lastInput, setLastInput] = useState<CaptureInput | null>(null);
  // Events that failed to write, for "Retry the failed events".
  const [failedIds, setFailedIds] = useState<string[]>([]);

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
    setScreen({ name: "loading", message: `Found ${result.events.length} dates` });
    setTimeout(() => setScreen({ name: "review", data: result }), 1200);
  }

  // Send the edited events to Lane 3. For now we only log it.
    function handleAdd(result: ParseResult) {
    setLastReviewed(result);
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
    setFailedIds(result.failed.map((f) => f.eventId));
    setScreen({ name: "success", result: payload as WriteResult });
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

  function recover(code: AppError["code"]) {
    if (code === "RATE_LIMIT" || code === "TIMEOUT") {
      // Try the same capture again. If we have none, go back to review.
      if (lastInput) startParsing(lastInput);
      else setScreen({ name: "review", data: lastReviewed });
    } else if (code === "NO_DATES" || code === "PARSE_FAILED") {
      // Task 6 will send the user to the input screen. For now: review.
      setScreen({ name: "review", data: fakeData });
    } else if (code === "PARTIAL_WRITE") {
      // Send only the events that failed.
      const retry = {
        ...lastReviewed,
        events: lastReviewed.events.filter((e) => failedIds.includes(e.id)),
      };
      handleAdd(retry);
    } else {
      // AUTH_DENIED and CALENDAR_ERROR: send the last write again.
      handleAdd(lastReviewed);
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
        <button
          type="button"
          style={{ marginBottom: 12 }}
          onClick={() => {
            // Pretend Lane 1 sent CAPTURE_READY, then Lane 2 answered 2 seconds later.
            startParsing({ kind: "text", text: "fake" });
            setTimeout(() => handleParseResult(fakeData), 2000);
          }}
        >
          Simulate: capture, then result
        </button>
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