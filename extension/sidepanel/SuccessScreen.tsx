import { useEffect, useRef } from "react";
import EventList from "./EventList";
import type { ParseResult, WriteResult } from "./types";

type Props = {
  result: WriteResult;
  submitted: ParseResult | null;
  onUndo: () => void;
  onConvertMore: () => void;
};

export default function SuccessScreen({ result, submitted, onUndo, onConvertMore }: Props) {
  // Move keyboard and screen reader focus to the heading when this screen appears.
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  const noun = result.added === 1 ? "event" : "events";
  const failedIds = new Set(result.failed.map(event => event.eventId));
  const addedEvents = submitted?.events.filter(event => !failedIds.has(event.id)) ?? [];
  // If a result has no matching request, don't guess which events were added.
  const canShowEvents = addedEvents.length === result.added;

  return (
    <div className="result-screen results-enter">
      <div className="result-summary">
        <h1 ref={headingRef} tabIndex={-1}>
          <a className="calendar-link" href={result.calendarLink} target="_blank" rel="noreferrer">
            {submitted?.calendarName || "Your calendar"}
          </a>
        </h1>
        <p className="result-count" role="status">{result.added} {noun} added</p>
      </div>

      {canShowEvents && addedEvents.length > 0 ? (
        <section aria-label="Added events">
          <EventList events={addedEvents} />
          {addedEvents.some(event => !event.allDay) && submitted?.timeZone && (
            <p className="secondary-text event-timezone">Times in {submitted.timeZone}</p>
          )}
        </section>
      ) : result.added > 0 ? (
        <p className="secondary-text">Open the calendar to see the added events.</p>
      ) : null}

      {result.failed.length > 0 && (
        <section className="result-issue" aria-labelledby="failed-events-heading">
          <h2 id="failed-events-heading">Not added</h2>
          <ul className="failure-list">
            {result.failed.map(failure => (
              <li key={failure.eventId}>
                <span className="event-title">
                  {submitted?.events.find(event => event.id === failure.eventId)?.title || "Event"}
                </span>
                <p>{failure.reason}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="result-actions">
        <a className="button-primary calendar-open" href={result.calendarLink} target="_blank" rel="noreferrer">
          Open in Google Calendar
        </a>
        <button type="button" onClick={onConvertMore}>Convert more</button>
        <button type="button" onClick={onUndo}>Undo</button>
      </div>
    </div>
  );
}
