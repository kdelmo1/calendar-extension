// Saved results for the 3 demo inputs (task 10), used when the server can't answer
// during the demo (no Wi-Fi, Gemini busy, rate limit...). They are made by
// `npm run save:demo` in proxy/, and each one passed its answer key when saved.
//
// findBackup(input) returns the saved ParseResult if `input` is one of the demo inputs:
//   - files, screenshots, images: the exact same bytes (SHA-256 fingerprint)
//   - highlighted text: contains ALL of the demo's key phrases
//   - right-clicked image: the image URL contains the demo's file name
// Otherwise it returns null, and nothing changes.

import forumFlyer from "./backups/forum-flyer-png.json";
import ucscKeyDates from "./backups/ucsc-key-dates.json";
import ucsdCalendar from "./backups/ucsd-calendar-pdf.json";
import type { CaptureInput, ParseResult } from "./types";

type Backup = {
  name: string;
  match: { sha256?: string; phrases?: string[]; imageUrlIncludes?: string[] };
  result: ParseResult;
};

const BACKUPS = [ucscKeyDates, forumFlyer, ucsdCalendar] as unknown as Backup[];

export async function findBackup(input: CaptureInput): Promise<{ name: string; result: ParseResult } | null> {
  const hash = input.fileBase64 ? await sha256OfBase64(input.fileBase64) : null;
  const text = (input.text ?? "").toLowerCase();

  for (const backup of BACKUPS) {
    const { sha256, phrases, imageUrlIncludes } = backup.match;
    const sameFile = hash !== null && hash === sha256;
    const sameText = !!phrases && text !== "" && phrases.every((p) => text.includes(p.toLowerCase()));
    const sameImage = !!imageUrlIncludes && !!input.imageUrl && imageUrlIncludes.some((s) => input.imageUrl!.includes(s));
    if (sameFile || sameText || sameImage) {
      // Fresh ids, in case the same demo is run twice in one session.
      const events = backup.result.events.map((e) => ({ ...e, id: crypto.randomUUID() }));
      return { name: backup.name, result: { ...backup.result, events } };
    }
  }
  return null;
}

// SHA-256 fingerprint of a base64 file, as hex (same as Node's createHash("sha256")).
async function sha256OfBase64(b64: string): Promise<string | null> {
  try {
    const bytes = Uint8Array.from(atob(b64.replace(/^data:[^,]*,/, "")), (c) => c.charCodeAt(0));
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return null; // not valid base64: can't be a demo file
  }
}
