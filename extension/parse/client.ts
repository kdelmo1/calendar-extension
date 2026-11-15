// Calls our server (proxy/) and always returns a ParseResult or an AppError.
// It never throws, so the caller doesn't need try/catch.
// For the 3 demo inputs, it falls back to a saved result if the server can't answer (see backups.ts).

import { findBackup } from "./backups";
import type { AppError, CaptureInput, ParseResult } from "./types";

// Our Cloud Run server. To use a server on your own computer instead, create a file
// `.env.local` in the repo root with:  VITE_PROXY_URL=http://localhost:8080
// then rebuild the extension (Vite reads it at build time).
const DEPLOYED_URL = "https://calendar-proxy-r76ml3czfq-uw.a.run.app";
export const PROXY_URL: string = import.meta.env?.VITE_PROXY_URL || DEPLOYED_URL;

// The server gives up after 30 s (and big inputs may use a retry), so we wait a bit longer.
const CLIENT_TIMEOUT_MS = 40_000;
// For the 3 demo inputs we have a saved backup, so don't keep the audience waiting:
// normally they take 2-13 s, so after 20 s we switch to the backup.
const DEMO_TIMEOUT_MS = 20_000;

export async function parseOnServer(input: CaptureInput): Promise<ParseResult | AppError> {
  // Is this one of the demo inputs with a saved result? (null for everything else)
  const backup = await findBackup(input);
  if (!backup) return callServer(input, CLIENT_TIMEOUT_MS);

  if (globalThis.navigator?.onLine === false) return useBackup(backup, "offline");
  const live = await callServer(input, DEMO_TIMEOUT_MS);
  // "No dates" is a real answer; anything else (no network, timeout, rate limit, Gemini error) -> backup.
  if (isAppError(live) && live.code !== "NO_DATES") return useBackup(backup, live.code);
  return live;
}

function useBackup(backup: { name: string; result: ParseResult }, reason: string): ParseResult {
  console.warn(`[parse] Using saved demo result "${backup.name}" (${reason})`);
  return backup.result;
}

async function callServer(input: CaptureInput, timeoutMs: number): Promise<ParseResult | AppError> {
  let res: Response;
  try {
    res = await fetch(`${PROXY_URL}/parse`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(timeoutMs),
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
