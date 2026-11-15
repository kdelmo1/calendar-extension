// Turns a CaptureInput into the "parts" of the message we send to Gemini.
//
//   kind "text"        -> a text part
//   kind "file"        -> .txt/.md: decoded to text;  PDF/images: sent as inline data
//   kind "screenshot"  -> inline image data
//   kind "image"       -> fileBase64 if given, otherwise download imageUrl here on the server
//
// Gemini reads PDFs and images directly ("inline data" = the file as base64).
// Docs: https://ai.google.dev/gemini-api/docs/document-processing
//       https://ai.google.dev/gemini-api/docs/image-understanding

import { AppErrorException } from "./errors.js";
import type { GeminiPart } from "./gemini.js";
import type { CaptureInput } from "./types.js";

// Gemini's limit for a whole request with inline data is about 20 MB,
// and base64 makes files ~33% bigger, so keep files under 14 MB.
const MAX_FILE_BYTES = 14 * 1024 * 1024;

// File types Gemini can read as inline data.
const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/heic", "image/heif"];
const PDF_TYPE = "application/pdf";
// Plain-text types: we decode these ourselves and send them as text.
const TEXT_TYPES = ["text/plain", "text/markdown", "text/x-markdown", "text/csv", "text/html"];

export async function buildParts(input: CaptureInput): Promise<GeminiPart[]> {
  // Page title/URL help Gemini guess the year and the calendar name.
  const context: string[] = [];
  if (input.pageTitle) context.push(`Page title: ${input.pageTitle}`);
  if (input.pageUrl) context.push(`Page URL: ${input.pageUrl}`);
  const intro = (what: string): GeminiPart => ({ text: [...context, what].join("\n") });

  switch (input.kind) {
    case "text": {
      if (!input.text?.trim()) throw noInput();
      return [{ text: [...context, "Input:", input.text].join("\n") }];
    }

    case "file":
    case "screenshot": {
      if (!input.fileBase64) throw noInput();
      const bytes = decodeBase64(input.fileBase64);
      const mimeType = pickMimeType(input.mimeType, bytes, input.kind === "screenshot" ? "image/png" : undefined);

      if (TEXT_TYPES.includes(mimeType)) {
        // .txt / .md: just send the words.
        const text = bytes.toString("utf8");
        if (!text.trim()) throw noInput();
        return [{ text: [...context, "Input (from an uploaded text file):", text].join("\n") }];
      }
      const what = input.kind === "screenshot" ? "Input: a screenshot of the page." : "Input: the attached file.";
      return [intro(what), inline(mimeType, bytes)];
    }

    case "image": {
      let bytes: Buffer;
      let mimeType: string;
      if (input.fileBase64) {
        bytes = decodeBase64(input.fileBase64);
        mimeType = pickMimeType(input.mimeType, bytes);
      } else if (input.imageUrl) {
        ({ bytes, mimeType } = await downloadImage(input.imageUrl));
      } else {
        throw noInput();
      }
      return [intro("Input: the attached image."), inline(mimeType, bytes)];
    }

    default:
      throw new AppErrorException("PARSE_FAILED", "We don't know how to read this kind of input.", 400);
  }
}

// ---------- helpers ----------

function noInput() {
  return new AppErrorException("NO_DATES", "Nothing was captured. Try selecting the dates again.", 400);
}

function tooBig() {
  return new AppErrorException("PARSE_FAILED", "That file is too big. Please use one under 14 MB.", 413);
}

// Makes an inline-data part, after checking Gemini can read this type.
function inline(mimeType: string, bytes: Buffer): GeminiPart {
  if (mimeType !== PDF_TYPE && !IMAGE_TYPES.includes(mimeType)) {
    throw new AppErrorException(
      "PARSE_FAILED",
      "That file type isn't supported. Please use a PDF, PNG, JPEG, WEBP, TXT or MD file.",
      415,
    );
  }
  if (bytes.length > MAX_FILE_BYTES) throw tooBig();
  return { inlineData: { mimeType, data: bytes.toString("base64") } };
}

// Base64 text -> bytes. Also accepts a "data:...;base64," prefix by accident.
function decodeBase64(b64: string): Buffer {
  const clean = b64.replace(/^data:[^,]*,/, "");
  const bytes = Buffer.from(clean, "base64");
  if (bytes.length === 0) throw noInput();
  if (bytes.length > MAX_FILE_BYTES) throw tooBig();
  return bytes;
}

// Use the mimeType Lane 1 sent; if it's missing or vague, look at the file's first bytes.
// (Browsers often give "" or "application/octet-stream" for .md files.)
function pickMimeType(given: string | undefined, bytes: Buffer, fallback?: string): string {
  const type = (given || "").split(";")[0].trim().toLowerCase();
  if (type && type !== "application/octet-stream") return type === "image/jpg" ? "image/jpeg" : type;
  return sniffMimeType(bytes) ?? fallback ?? "text/plain";
}

function sniffMimeType(bytes: Buffer): string | null {
  const start = bytes.subarray(0, 12);
  if (start.subarray(0, 4).toString("latin1") === "%PDF") return PDF_TYPE;
  if (start[0] === 0x89 && start.subarray(1, 4).toString("latin1") === "PNG") return "image/png";
  if (start[0] === 0xff && start[1] === 0xd8) return "image/jpeg";
  if (start.subarray(0, 4).toString("latin1") === "RIFF" && start.subarray(8, 12).toString("latin1") === "WEBP") {
    return "image/webp";
  }
  return null;
}

// Downloads a right-clicked image. Returns its bytes and type.
async function downloadImage(imageUrl: string): Promise<{ bytes: Buffer; mimeType: string }> {
  // Some pages use "data:" URLs: the image is already inside the URL.
  if (imageUrl.startsWith("data:")) {
    const match = imageUrl.match(/^data:([^;,]+)?(;base64)?,/);
    if (!match?.[2]) throw imageError();
    const bytes = decodeBase64(imageUrl);
    return { bytes, mimeType: pickMimeType(match[1], bytes) };
  }

  let url: URL;
  try {
    url = new URL(imageUrl);
  } catch {
    throw imageError();
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw imageError();
  // Safety: once deployed, don't let anyone use our server to reach private/internal addresses.
  // (K_SERVICE is set automatically on Cloud Run; locally this check is skipped for testing.)
  if (process.env.K_SERVICE && isPrivateHost(url.hostname)) throw imageError();

  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(10_000), redirect: "follow" });
  } catch {
    throw imageError();
  }
  if (!res.ok) throw imageError();

  if (Number(res.headers.get("content-length")) > MAX_FILE_BYTES) throw tooBig();
  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.length > MAX_FILE_BYTES) throw tooBig();

  // Trust the actual bytes over the server's Content-Type header when we can recognise them.
  const mimeType = sniffMimeType(bytes) ?? pickMimeType(res.headers.get("content-type") ?? undefined, bytes);
  return { bytes, mimeType };
}

function imageError() {
  return new AppErrorException(
    "PARSE_FAILED",
    "We couldn't download that image. Try taking a screenshot instead.",
    400,
  );
}

// Very simple check for addresses that point inside a network rather than the public internet.
function isPrivateHost(host: string): boolean {
  const h = host.replace(/^\[|\]$/g, "").toLowerCase();
  if (h.includes(":")) {
    // IPv6 address: loopback, private (fc00::/7) or link-local (fe80::/10)
    return h === "::1" || /^f[cd]/.test(h) || /^fe[89ab]/.test(h);
  }
  return (
    h === "localhost" ||
    h.endsWith(".localhost") ||
    h.endsWith(".internal") ||
    /^(127|10|0)\./.test(h) ||
    /^192\.168\./.test(h) ||
    /^169\.254\./.test(h) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(h)
  );
}
