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

// Files arrive as base64 text, so allow big request bodies.
app.use(express.json({ limit: "20mb" }));

// TODO(task 7): allow requests from the extension's origin (CORS).

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
