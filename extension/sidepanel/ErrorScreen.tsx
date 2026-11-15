import { useEffect, useRef } from "react";
import type { AppError } from "./types";

type Props = {
  error: AppError;
  onRecover: () => void; // runs when the recovery button is clicked
  onBack?:() => void;
};

// One heading and one button label for each error code.
const COPY: Record<AppError["code"], { title: string; button: string }> = {
  NO_DATES: { title: "No dates found", button: "Try another selection" },
  PARSE_FAILED: { title: "Couldn't read that", button: "Try another selection" },
  RATE_LIMIT: { title: "Too many requests", button: "Retry" },
  TIMEOUT: { title: "That took too long", button: "Retry" },
  AUTH_DENIED: { title: "Sign-in needed", button: "Sign in again" },
  PARTIAL_WRITE: { title: "Some events weren't added", button: "Retry the failed events" },
  CALENDAR_ERROR: { title: "Google Calendar problem", button: "Retry" },
};

export default function ErrorScreen({ error, onRecover, onBack }: Props) {
  // Move focus to the heading so screen readers read the error first.
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  const copy = COPY[error.code];


  const canGoBack =
    onBack && (error.code === "CALENDAR_ERROR" || error.code === "PARTIAL_WRITE");

  return (
    <div className="cal-fade">
      <h1 ref={headingRef} tabIndex={-1} className = "cal-title">
        {copy.title}
      </h1>
      <p>{error.message}</p>
      <div className="cal-row" style={{alignItems: "center" }}>
        <button type="button" className="cal-btn cal-btn-filled" onClick={onRecover}>
          {copy.button}
        </button>
        {canGoBack && (
          <button type="button" className="cal-btn cal-btn-text" onClick={onBack}>
            Back to review
          </button>
        )}
      </div>
    </div>
  );
}