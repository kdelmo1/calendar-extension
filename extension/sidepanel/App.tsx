import EventList from "./EventList";
import type { ParseResult } from "./types";
// Fake data from Lane 2's fixtures folder (repo root).
import fixture from "../../fixtures/ucsc-winter.json";

// JSON imports are typed loosely, so we tell TypeScript it's a ParseResult.
const data = fixture as unknown as ParseResult;

export default function App() {
  return (
    <main style={{ padding: 12, fontFamily: "sans-serif" }}>
      <h1 style={{ fontSize: 18 }}>{data.calendarName}</h1>
      <p>{data.events.length} events found</p>
      <EventList events={data.events} />
    </main>
  );
}