import type { AppError } from "../background/auth";
import type { CaptureInput } from "./types";

export type { CaptureInput } from "./types";
export type CaptureResult = CaptureInput | AppError;

export function textToCaptureInput(text: string): CaptureResult {
  const trimmed = text.trim();
  if (!trimmed) {
    return { code: "NO_DATES", message: "Paste some text containing dates first." };
  }
  // Finding dates is Lane 2's job; keep all nonempty text for parsing.
  return { kind: "text", text: trimmed };
}

const mimeTypes: Record<string, string> = {
  pdf: "application/pdf",
  txt: "text/plain",
  md: "text/markdown",
  markdown: "text/markdown",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

export async function fileToCaptureInput(file: File): Promise<CaptureResult> {
  if (file.size === 0) {
    return { code: "NO_DATES", message: "This file is empty. Choose a file containing dates." };
  }

  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  // Browsers sometimes leave the MIME type blank for Markdown or pasted files.
  const suppliedType = file.type.split(";")[0].trim().toLowerCase();
  const mimeType = !suppliedType || suppliedType === "application/octet-stream"
    ? mimeTypes[extension]
    : suppliedType;

  if (!mimeType || !Object.values(mimeTypes).includes(mimeType)) {
    return {
      code: "PARSE_FAILED",
      message: "Choose a PDF, TXT, MD, PNG, JPEG, or WebP file.",
    };
  }

  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = "";
    // Small chunks avoid overflowing the argument limit on larger PDFs.
    for (let offset = 0; offset < bytes.length; offset += 32768) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
    }
    return { kind: "file", fileBase64: btoa(binary), mimeType };
  } catch {
    return {
      code: "PARSE_FAILED",
      message: "Could not read this file. Please choose it again.",
    };
  }
}
