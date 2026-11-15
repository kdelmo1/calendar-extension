import { useEffect, useRef, useState } from "react";
import { fileToCaptureInput, textToCaptureInput } from "./capture";
import type { CaptureInput } from "./types";

type Props = {
  onSubmit: (input: CaptureInput) => void; // sends the input on to parsing
};

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
// Lane 1 supports PDF, TXT, MD, PNG, JPEG and WebP.
const OK_EXTENSIONS = [
  ".pdf",
  ".txt",
  ".md",
  ".markdown",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
];

// Is this file one we can read?
function isSupported(file: File): boolean {
  const name = file.name.toLowerCase();
  return OK_EXTENSIONS.some((ext) => name.endsWith(ext));
}

export default function InputScreen({ onSubmit }: Props) {
  const [text, setText] = useState("");
  const [problem, setProblem] = useState(""); // inline message, empty = none

  // Put focus on the heading when the screen appears.
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  // User picked a file.
  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // lets the same file be picked again later
    if (!file) return;

    if (!isSupported(file)) {
      setProblem(
        "That file type isn't supported. Use a PDF, TXT, MD, PNG, JPEG or WebP file."
      );
      return;
    }
    if (file.size > MAX_BYTES) {
      setProblem("That file is over 10 MB. Try a smaller one.");
      return;
    }
    try {
      setProblem("");
      const result = await fileToCaptureInput(file);
      // Lane 1 returns an AppError when it can't read the file.
      if ("code" in result) {
        setProblem(result.message);
        return;
      }
      onSubmit(result);
    } catch {
      setProblem("Couldn't read that file. Try another one.");
    }
  }

  // User pressed "Find dates" for pasted text.
  function handlePaste() {
    const result = textToCaptureInput(text);
    // Lane 1 returns an AppError for empty text.
    if ("code" in result) {
      setProblem("Paste some text with dates first.");
      return;
    }
    setProblem("");
    onSubmit(result);
  }

  return (
    <div>
      <h1 ref={headingRef} tabIndex={-1} style={{ fontSize: 18 }}>
        Add your dates
      </h1>
      <p>
        Highlight text on a page, right-click an image, or add a file or text
        here.
      </p>

      {/* Problems are announced to screen readers as soon as they appear. */}
      {problem && (
        <p role="alert" style={{ color: "#b00020", fontWeight: "bold" }}>
          {problem}
        </p>
      )}

      <section aria-labelledby="upload-heading" style={{ marginBottom: 16 }}>
        <h2 id="upload-heading" style={{ fontSize: 16 }}>
          Upload a file
        </h2>
        <label htmlFor="file-input">
          PDF, TXT, MD, PNG, JPEG or WebP (up to 10 MB)
        </label>
        <input
          id="file-input"
          type="file"
          accept=".pdf,.txt,.md,.markdown,.png,.jpg,.jpeg,.webp"
          onChange={handleFile}
        />
      </section>

      <section aria-labelledby="paste-heading">
        <h2 id="paste-heading" style={{ fontSize: 16 }}>
          Or paste text
        </h2>
        <label htmlFor="paste-input">Text that contains dates</label>
        <textarea
          id="paste-input"
          rows={6}
          value={text}
          onChange={(e) => setText(e.target.value)}
          style={{ width: "100%", boxSizing: "border-box" }}
        />
        <button
          type="button"
          className="primary"
          onClick={handlePaste}
          style={{ marginTop: 8 }}
        >
          Find dates
        </button>
      </section>
    </div>
  );
}