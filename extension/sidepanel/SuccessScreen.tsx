import { useEffect, useRef } from "react";
import type { WriteResult } from "./types";

type Props = {
  result: WriteResult;
  onUndo: () => void;
};

export default function SuccessScreen({ result, onUndo }: Props) {
  // Move keyboard and screen reader focus to the heading when this screen appears.
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  const noun = result.added === 1 ? "event" : "events";

  return (
    <div role="status">
      <h1 ref={headingRef} tabIndex={-1} style={{ fontSize: 18 }}>
        Added {result.added} {noun}
      </h1>

      {/* Some events may have failed. Task 5 adds a retry button for this. */}
      {(result.failed?.length ?? 0) > 0 && (
        <p>{result.failed?.length ?? 0} could not be added.</p>
      )}

      <p>
        <a href={result.calendarLink} target="_blank" rel="noreferrer">
          Open in Google Calendar
        </a>
      </p>

      <button type="button" onClick={onUndo} style={{ padding: "8px 12px" }}>
        Undo (delete this calendar)
      </button>
    </div>
  );
}