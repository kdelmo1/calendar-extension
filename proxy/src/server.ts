// The web server. Run it with:  npm run dev   (from the proxy/ folder)
//
// Endpoints:
//   GET  /health  -> { ok: true }               (quick "is it running?" check)
//   POST /parse   -> body: CaptureInput
//                    200: ParseResult
//                    4xx/5xx: AppError  { code, message }

import express from "express";
import { AppErrorException } from "./errors.js";
import { parseCapture } from "./parse.js";
import type { AppError, CaptureInput } from "./types.js";

const app = express();

// CORS: browsers only let a page or extension read our replies if we say its "origin" is
// allowed. We allow our Chrome extension (its ID is fixed by the `key` in manifest.json).
// Add more with ALLOWED_ORIGINS="origin1,origin2" in .env or on Cloud Run.
// Requests with no Origin header (curl, our test scripts) are always allowed.
const EXTENSION_ORIGIN = "chrome-extension://dclcclgfpcknfcfbehgedbnofmabmmoo";
const allowedOrigins = [EXTENSION_ORIGIN, ...(process.env.ALLOWED_ORIGINS ?? "").split(",")]
  .map((o) => o.trim())
  .filter(Boolean);

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin) {
    if (!allowedOrigins.includes(origin)) {
      // Another website trying to use our server (and our Gemini quota) from a browser.
      const body: AppError = { code: "PARSE_FAILED", message: "This website is not allowed to use this server." };
      res.status(403).json(body);
      return;
    }
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Max-Age", "600"); // browser may cache this answer for 10 minutes
  }
  // The browser's "preflight" check before a POST: answer it with no body.
  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }
  next();
});

// Files arrive as base64 text, so allow big request bodies.
app.use(express.json({ limit: "20mb" }));

// A body that isn't valid JSON (or is too big) -> AppError instead of Express's HTML error page.
app.use((err: Error & { status?: number }, _req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (!err) return next();
  const tooBig = err.status === 413;
  const body: AppError = {
    code: "PARSE_FAILED",
    message: tooBig ? "That file is too big. Please use one under 14 MB." : "The request was not valid JSON.",
  };
  res.status(tooBig ? 413 : 400).json(body);
});

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/parse", async (req, res) => {
  const started = Date.now();
  try {
    const input = req.body as CaptureInput;
    if (!input || typeof input.kind !== "string") {
      throw new AppErrorException("PARSE_FAILED", "The request was not a valid capture.", 400);
    }
    const result = await parseCapture(input);
    console.log(`/parse ok: ${result.events.length} events in ${Date.now() - started} ms`);
    res.json(result);
  } catch (err) {
    sendError(res, err);
  }
});

// Turns any error into an AppError reply.
function sendError(res: express.Response, err: unknown) {
  if (err instanceof AppErrorException) {
    console.warn(`/parse ${err.code}: ${err.message}`);
    res.status(err.status).json(err.toJSON());
    return;
  }
  console.error("Unexpected error", err);
  const body: AppError = { code: "PARSE_FAILED", message: "Something went wrong reading your dates." };
  res.status(500).json(body);
}

// Cloud Run tells us which port to use with the PORT variable.
const port = Number(process.env.PORT) || 8080;
app.listen(port, () => {
  console.log(`Proxy listening on http://localhost:${port}`);
});
