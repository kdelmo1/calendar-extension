import ReviewScreen from "./ReviewScreen";
import type { ParseResult } from "./types";
// Fake data from Lane 2's fixtures folder (repo root).
import fixture from "../../fixtures/ucsc-winter.json";

// JSON imports are typed loosely, so we tell TypeScript it's a ParseResult.
const data = fixture as unknown as ParseResult;

export default function App() {
  function handleAdd(result: ParseResult){
    console.log("WRITE_REQUEST", result);
  }
  return (
    <main style={{ padding: 12, fontFamily: "sans-serif" }}>
      <h1 style={{ fontSize: 18 }}>Review your events</h1>
      <ReviewScreen initial={data} onAdd={handleAdd} />
    </main>
  );
}