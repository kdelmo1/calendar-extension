import { useEffect, useRef } from "react";
import type { AppError } from "./types";

type Props = {
  error: AppError;
  onRecover: () => void; // runs when the recovery button is clicked
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

export default function ErrorScreen({ error, onRecover }: Props) {
  // Move focus to the heading so screen readers read the error first.
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  const copy = COPY[error.code];

  return (
    <div role="alert">
      <h1 ref={headingRef} tabIndex={-1} style={{ fontSize: 18 }}>
        {copy.title}
      </h1>
      <p>{error.message}</p>
      <button type="button" onClick={onRecover} style={{ padding: "8px 12px" }}>
        {copy.button}
      </button>
    </div>
  );
}