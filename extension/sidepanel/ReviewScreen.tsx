import { useEffect, useRef, useState } from "react";
import EventCard from "./EventCard";
import type { CalendarEvent, EditRequest, ParseResult } from "./types";

type Props = {
  initial: ParseResult;
  // Called with the final, edited data when the user clicks the button.
  onAdd: (result: ParseResult) => void;
  // Sends a plain-English edit request (App does the messaging).
  onEdit: (request: EditRequest) => void;
  editBusy: boolean; // true while we wait for Gemini
  editNote: { text: string; isError: boolean } | null; // summary or error
  // A new list from Gemini. "n" changes every time, so we know it is new.
  replacement: { result: ParseResult; n: number } | null;
};

export default function ReviewScreen({
  initial,
  onAdd,
  onEdit,
  editBusy,
  editNote,
  replacement,
}: Props) {
  // Local copies so the user can edit without touching the original data.
  const [calendarName, setCalendarName] = useState(initial.calendarName);
  const [events, setEvents] = useState<CalendarEvent[]>(initial.events);
  const [instruction, setInstruction] = useState("");

  // Remember the last replacement we used, so an old one is never applied twice
  // (including one that arrived while another screen was showing).
  const lastApplied = useRef(replacement?.n);

  // When Gemini sends a new list, REPLACE ours with it.
  useEffect(() => {
    if (!replacement || replacement.n === lastApplied.current) return;
    lastApplied.current = replacement.n;
    setCalendarName(replacement.result.calendarName);
    setEvents(replacement.result.events);
    setInstruction(""); // clear the box only after a successful answer
  }, [replacement]);

  function updateEvent(updated: CalendarEvent) {
    setEvents((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
  }

  function deleteEvent(id: string) {
    setEvents((prev) => prev.filter((e) => e.id !== id));
  }

  // Send the events as they are right now, including manual edits.
  function handleEditSubmit() {
    const text = instruction.trim();
    if (!text || editBusy) return;
    onEdit({
      events,
      instruction: text,
      calendarName,
      timeZone: initial.timeZone,
    });
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
    <div className="review-screen">
      <div>
        <label htmlFor="calendar-name">
          Calendar name
        </label>
        <input
          id="calendar-name"
          type="text"
          value={calendarName}
          onChange={(e) => setCalendarName(e.target.value)}
        />
      </div>

      {/* Plain-English edits (optional feature) */}
      <div className="review-edit">
        <label htmlFor="edit-instruction">
          Tell us what to change
        </label>
        <input
          id="edit-instruction"
          type="text"
          placeholder="e.g. move the midterm to Friday"
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleEditSubmit();
          }}
        />
        <button
          type="button"
          onClick={handleEditSubmit}
          disabled={editBusy || !instruction.trim()}
        >
          {editBusy ? "Updating…" : "Apply change"}
        </button>

        {/* Shows Gemini's summary, or the error message as is. */}
        {editNote && (
          <p
            role={editNote.isError ? "alert" : "status"}
            className="edit-note"
          >
            {editNote.text}
          </p>
        )}
      </div>

      {needsCheck.length > 0 && (
        <section aria-labelledby="check-heading">
          <h2 id="check-heading">
            Check these <span className="section-count">({needsCheck.length})</span>
          </h2>
          <ul>
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
        <h2 id="good-heading">
          Looks good <span className="section-count">({looksGood.length})</span>
        </h2>
        <ul>
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

      <div className="review-footer">
        <button
          type="button"
          onClick={handleAdd}
          disabled={events.length === 0}
          className="primary"
        >
          Add to Google Calendar ({events.length})
        </button>
      </div>
    </div>
  );
}
