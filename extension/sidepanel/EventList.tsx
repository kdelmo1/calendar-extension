import type { CalendarEvent } from "./types";

// Turn the start/end strings into something readable for a person.
function formatWhen(event: CalendarEvent): string {
  if (event.allDay) {
    // All-day events use "YYYY-MM-DD". Show a range only if the end differs.
    return event.start === event.end
      ? event.start
      : `${event.start} to ${event.end}`;
  }
  const start = new Date(event.start).toLocaleString();
  const end = new Date(event.end).toLocaleString();
  return `${start} to ${end}`;
}

type Props = { events: CalendarEvent[] };

export default function EventList({ events }: Props) {
  return (
    <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
      {events.map((event) => (
        <li
          key={event.id}
          style={{ padding: "8px 0", borderBottom: "1px solid #ddd" }}
        >
          <strong>{event.title}</strong>
          <div>{formatWhen(event)}</div>
          <div style={{ fontSize: 12 }}>
            {event.category}
            {/* Show a plain-text flag for low confidence (not color alone) */}
            {event.confidence < 0.7 && " · Needs checking"}
          </div>
        </li>
      ))}
    </ul>
  );
}