import { useState } from "react";
import EventCard from "./EventCard";
import type { CalendarEvent, ParseResult } from "./types";

type Props = {
  initial: ParseResult;
  // Called with the final, edited data when the user clicks the button.
  onAdd: (result: ParseResult) => void;
};

export default function ReviewScreen({ initial, onAdd }: Props) {
  // Local copies so the user can edit without touching the original data.
  const [calendarName, setCalendarName] = useState(initial.calendarName);
  const [events, setEvents] = useState<CalendarEvent[]>(initial.events);

  function updateEvent(updated: CalendarEvent) {
    setEvents((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
  }

  function deleteEvent(id: string) {
    setEvents((prev) => prev.filter((e) => e.id !== id));
  }

  // Split into the two groups.
  const needsCheck = events.filter((e) => e.confidence < 0.7);
  const looksGood = events.filter((e) => e.confidence >= 0.7);

  function handleAdd() {
    onAdd({
      calendarName: calendarName.trim() || "Imported dates",
      timeZone: initial.timeZone,
      events,
    });
  }

  return (
    <div>
      <label htmlFor="calendar-name" style={{ display: "block" }}>
        Calendar name
      </label>
      <input
        id="calendar-name"
        type="text"
        value={calendarName}
        onChange={(e) => setCalendarName(e.target.value)}
        style={{ width: "100%", boxSizing: "border-box", marginBottom: 12 }}
      />

      {needsCheck.length > 0 && (
        <section aria-labelledby="check-heading">
          <h2 id="check-heading" style={{ fontSize: 16 }}>
            Check these ({needsCheck.length})
          </h2>
          <ul style={{ padding: 0, margin: 0 }}>
            {needsCheck.map((e) => (
              <EventCard
                key={e.id}
                event={e}
                onChange={updateEvent}
                onDelete={deleteEvent}
              />
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="good-heading">
        <h2 id="good-heading" style={{ fontSize: 16 }}>
          Looks good ({looksGood.length})
        </h2>
        <ul style={{ padding: 0, margin: 0 }}>
          {looksGood.map((e) => (
            <EventCard
              key={e.id}
              event={e}
              onChange={updateEvent}
              onDelete={deleteEvent}
            />
          ))}
        </ul>
      </section>

      <button
        type="button"
        onClick={handleAdd}
        disabled={events.length === 0}
        style={{ marginTop: 8, padding: "8px 12px" }}
      >
        Add to Google Calendar ({events.length})
      </button>
    </div>
  );
}