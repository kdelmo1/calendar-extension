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

      {/* Plain-English edits (optional feature) */}
      <div style={{ marginBottom: 12 }}>
        <label htmlFor="edit-instruction" style={{ display: "block" }}>
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
          style={{ width: "100%", boxSizing: "border-box" }}
        />
        <button
          type="button"
          onClick={handleEditSubmit}
          disabled={editBusy || !instruction.trim()}
          style={{ marginTop: 6, padding: "6px 10px" }}
        >
          {editBusy ? "Updating…" : "Apply change"}
        </button>

        {/* Shows Gemini's summary, or the error message as is. */}
        {editNote && (
          <p
            role={editNote.isError ? "alert" : "status"}
            style={{
              margin: "6px 0 0",
              color: editNote.isError ? "#b00020" : "inherit",
            }}
          >
            {editNote.text}
          </p>
        )}
      </div>

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