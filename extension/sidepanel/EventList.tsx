import type { CalendarEvent } from "./types";

// Turn the start/end strings into something readable for a person.
function formatWhen(event: CalendarEvent): string {
  const format = (value: string) => {
    // Preserve the dates/clock times the user reviewed, avoiding browser-zone shifts.
    const date = new Date(event.allDay ? `${value.slice(0, 10)}T00:00:00Z` : `${value.slice(0, 16)}Z`);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat(undefined, {
      month: "short", day: "numeric", year: "numeric", timeZone: "UTC",
      ...(event.allDay ? {} : { hour: "numeric", minute: "2-digit" }),
    }).format(date);
  };
  return event.start === event.end ? format(event.start) : `${format(event.start)} – ${format(event.end)}`;
}

type Props = { events: CalendarEvent[] };

export default function EventList({ events }: Props) {
  return (
    <ul className="added-event-list">
      {events.map((event) => (
        <li
          key={event.id}
        >
          <span className="event-title">{event.title}</span>
          <span className="secondary-text">{formatWhen(event)}</span>
        </li>
      ))}
    </ul>
  );
}
