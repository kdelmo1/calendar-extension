import type { CalendarEvent } from "./types";
import { toDateInput, toDateTimeInput } from "./dateUtils";

type Props = {
  event: CalendarEvent;
  onChange: (updated: CalendarEvent) => void; // called when any field changes
  onDelete: (id: string) => void;
};

export default function EventCard({ event, onChange, onDelete }: Props) {
  // Which kind of input to show depends on the all-day toggle.
  const inputType = event.allDay ? "date" : "datetime-local";
  const toValue = event.allDay ? toDateInput : toDateTimeInput;

  // When the toggle flips, reshape start and end to match the new format.
  function handleAllDayToggle(checked: boolean) {
    onChange({
      ...event,
      allDay: checked,
      start: checked ? toDateInput(event.start) : toDateTimeInput(event.start),
      end: checked ? toDateInput(event.end) : toDateTimeInput(event.end),
    });
  }

  // Unique ids so each label points at its own input.
  const id = event.id;

  return (
    <li className="event-card">
      <div>
        <label htmlFor={`title-${id}`}>
          Title
        </label>
        <input
          id={`title-${id}`}
          type="text"
          value={event.title}
          onChange={(e) => onChange({ ...event, title: e.target.value })}
        />
      </div>

      <div className="event-date-grid">
        <div>
          <label htmlFor={`start-${id}`}>
            Start
          </label>
          <input
            id={`start-${id}`}
            type={inputType}
            value={toValue(event.start)}
            onChange={(e) => onChange({ ...event, start: e.target.value })}
          />
        </div>

        <div>
          <label htmlFor={`end-${id}`}>
            End
          </label>
          <input
            id={`end-${id}`}
            type={inputType}
            value={toValue(event.end)}
            onChange={(e) => onChange({ ...event, end: e.target.value })}
          />
        </div>
      </div>

      <div>
        <label className="checkbox-label" htmlFor={`allday-${id}`}>
          <input
            id={`allday-${id}`}
            type="checkbox"
            checked={event.allDay}
            onChange={(e) => handleAllDayToggle(e.target.checked)}
          />{" "}
          All-day
        </label>
      </div>

      {/* Show where the event came from so the user can double-check it */}
      <div className="event-actions">
        <details>
          <summary>Source text</summary>
          <p className="event-source">{event.sourceText}</p>
        </details>

        <button type="button" onClick={() => onDelete(event.id)}>
          Delete{/* screen readers hear the title below */}
          <span className="sr-only">
            {" "}
            {event.title}
          </span>
        </button>
      </div>
    </li>
  );
}
