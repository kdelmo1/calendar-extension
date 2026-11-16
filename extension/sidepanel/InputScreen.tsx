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
  const [selectedFile, setSelectedFile] = useState<{ name: string; reading: boolean } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      setSelectedFile(null);
      setProblem(
        "That file type isn't supported. Use a PDF, TXT, MD, PNG, JPEG or WebP file."
      );
      return;
    }
    if (file.size > MAX_BYTES) {
      setSelectedFile(null);
      setProblem("That file is over 10 MB. Try a smaller one.");
      return;
    }
    try {
      setProblem("");
      setSelectedFile({ name: file.name, reading: true });
      const result = await fileToCaptureInput(file);
      // Lane 1 returns an AppError when it can't read the file.
      if ("code" in result) {
        setSelectedFile(null);
        setProblem(result.message);
        return;
      }
      setSelectedFile({ name: file.name, reading: false });
      onSubmit(result);
    } catch {
      setSelectedFile(null);
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
    <div className="input-screen">
      <div className="input-intro">
        <h1 ref={headingRef} tabIndex={-1}>Add dates</h1>
        <p>Upload a file or paste dates.</p>
      </div>

      {/* Problems are announced to screen readers as soon as they appear. */}
      {problem && (
        <p role="alert" className="input-problem">
          {problem}
        </p>
      )}

      <section className="upload-area" aria-labelledby="upload-heading">
        <h2 id="upload-heading">
          Upload a file
        </h2>
        <p id="file-help" className="secondary-text upload-help">
          PDF, TXT, MD or images. Up to 10 MB.
        </p>
        <input
          ref={fileInputRef}
          id="file-input"
          className="sr-only"
          tabIndex={-1}
          aria-label="Upload a file"
          type="file"
          accept=".pdf,.txt,.md,.markdown,.png,.jpg,.jpeg,.webp"
          onChange={handleFile}
        />
        <div className="file-picker">
          <button
            type="button"
            className="file-picker-button"
            onClick={() => fileInputRef.current?.click()}
            disabled={selectedFile?.reading}
            aria-describedby="file-help file-status"
          >
            Choose file
          </button>
          <p id="file-status" className="file-status" role="status" aria-live="polite" aria-atomic="true">
            {selectedFile
              ? `${selectedFile.reading ? "Reading: " : "Selected: "}${selectedFile.name}`
              : "No file chosen"}
          </p>
        </div>
      </section>

      <section className="paste-area" aria-labelledby="paste-heading">
        <h2 id="paste-heading">
          Paste text
        </h2>
        <label htmlFor="paste-input" className="sr-only">Text that contains dates</label>
        <textarea
          id="paste-input"
          rows={6}
          placeholder="e.g. Midterm — February 10, 2027"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <button
          type="button"
          className="primary"
          onClick={handlePaste}
        >
          Find dates
        </button>
      </section>
    </div>
  );
}
