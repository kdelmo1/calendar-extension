import type { CaptureInput } from "./types";

export function textToCaptureInput(text: string): CaptureInput {
  return { kind: "text", text: text.trim() };
}

// Browsers often leave file.type empty for .md files, so guess from the name.
function guessMimeType(file: File): string {
  if (file.type) return file.type;
  if (file.name.toLowerCase().endsWith(".md")) return "text/markdown";
  if (file.name.toLowerCase().endsWith(".txt")) return "text/plain";
  return "application/octet-stream";
}

// Uploaded file -> CaptureInput (base64 without the "data:" prefix)
export function fileToCaptureInput(file: File): Promise<CaptureInput> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result); // "data:<type>;base64,<data>"
      resolve({
        kind: "file",
        fileBase64: dataUrl.split(",")[1] ?? "",
        mimeType: guessMimeType(file),
        pageTitle: file.name,
      });
    };
    reader.onerror = () => reject(new Error("Could not read that file."));
    reader.readAsDataURL(file);
  });
}