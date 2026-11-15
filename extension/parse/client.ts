// Calls our server (proxy/) and always returns a ParseResult or an AppError.
// It never throws, so the caller doesn't need try/catch.

import type { AppError, CaptureInput, ParseResult } from "./types";

// Our Cloud Run server. To use a server on your own computer instead, create a file
// `.env.local` in the repo root with:  VITE_PROXY_URL=http://localhost:8080
// then rebuild the extension (Vite reads it at build time).
const DEPLOYED_URL = "https://calendar-proxy-r76ml3czfq-uw.a.run.app";
export const PROXY_URL: string = import.meta.env?.VITE_PROXY_URL || DEPLOYED_URL;

// The server gives up after 30 s (and big inputs may use a retry), so we wait a bit longer.
const CLIENT_TIMEOUT_MS = 40_000;

export async function parseOnServer(input: CaptureInput): Promise<ParseResult | AppError> {
  let res: Response;
  try {
    res = await fetch(`${PROXY_URL}/parse`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(CLIENT_TIMEOUT_MS),
    });
  } catch (err) {
    if (err instanceof Error && err.name === "TimeoutError") {
      return { code: "TIMEOUT", message: "Reading the dates took too long. Try selecting a smaller part, or try again." };
    }
    // Offline, server down, or blocked by CORS.
    return { code: "PARSE_FAILED", message: "Couldn't reach our server. Check your internet connection and try again." };
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return { code: "PARSE_FAILED", message: "Our server sent an unreadable answer. Please try again." };
  }

  // The server already sends AppErrors in the right shape; pass them straight on.
  if (isAppError(body)) return body;
  if (res.ok && isParseResult(body)) return body;
  return { code: "PARSE_FAILED", message: "Our server sent an unexpected answer. Please try again." };
}

function isAppError(x: unknown): x is AppError {
  const e = x as AppError;
  return typeof e === "object" && e !== null && typeof e.code === "string" && typeof e.message === "string";
}

function isParseResult(x: unknown): x is ParseResult {
  const r = x as ParseResult;
  return typeof r === "object" && r !== null && typeof r.calendarName === "string" &&
    typeof r.timeZone === "string" && Array.isArray(r.events);
}
