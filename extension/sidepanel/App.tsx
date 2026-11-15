import { useEffect, useState } from "react";
import LoadingScreen from "./LoadingScreen";
import ReviewScreen from "./ReviewScreen";
import type { AppError, CaptureInput, Message, ParseResult } from "./types";
// Fake data from Lane 2's fixtures folder (repo root).
import fixture from "../../fixtures/ucsc-winter.json";

// JSON imports are typed loosely, so we tell TypeScript it's a ParseResult.
const fakeData = fixture as unknown as ParseResult;

const SHOW_DEMO_CONTROLS = true;

type Screen = 
  | { name: "loading"; message: string }
  | { name: "review"; data: ParseResult }
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

  // Show loading text, then ask Lane 2 to parse.
  function startParsing(input: CaptureInput) {
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

  // Listen for messages from the other lanes.
  useEffect(() => {
    if (typeof chrome === "undefined" || !chrome.runtime?.onMessage) return;

    function listener(message: Message) {
      if (message.type === "CAPTURE_READY") {
        startParsing(message.payload as CaptureInput);
      }
      if (message.type === "PARSE_RESULT") {
        handleParseResult(message.payload);
      }
    }

    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  // Send the edited events to Lane 3. For now we only log it.
  function handleAdd(result: ParseResult) {
    console.log("WRITE_REQUEST", result);
    // Later: send({ type: "WRITE_REQUEST", payload: result });
  }

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

      {screen.name === "loading" && <LoadingScreen message={screen.message} />}

      {screen.name === "review" && (
        <>
          <h1 style={{ fontSize: 18 }}>Review your events</h1>
          {/* key makes React start fresh when new events arrive */}
          <ReviewScreen key={screen.data.calendarName + screen.data.events.length} initial={screen.data} onAdd={handleAdd} />
        </>
      )}

      {screen.name === "error" && (
        <p role="alert">{screen.error.message}</p>
      )}
    </main>
  );
}