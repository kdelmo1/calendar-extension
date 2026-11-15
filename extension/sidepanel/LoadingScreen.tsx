import { useEffect, useState } from "react";

type Props = { message: string };

export default function LoadingScreen({ message }: Props) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    setSlow(false);
    const timer = window.setTimeout(() => setSlow(true), 8000);
    return () => window.clearTimeout(timer);
  }, [message]);

  return (
    // role="status" makes screen readers announce the text when it changes.
    <div role="status" aria-live="polite" style={{ textAlign: "center", padding: 24 }}>
      {/* The keyframes live here because inline styles can't define them. */}
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .spinner { animation: spin 1s linear infinite; }
        @media (prefers-reduced-motion: reduce) { .spinner { animation: none; } }
      `}</style>
      <div
        className="spinner"
        aria-hidden="true"
        style={{
          width: 32,
          height: 32,
          margin: "0 auto 12px",
          border: "4px solid #ccc",
          borderTopColor: "#1a73e8",
          borderRadius: "50%",
        }}
      />
      <p style={{ margin: 0 }}>{message}</p>
      {slow && (
        <p style ={{margin:"8px 0 0", frontSize: 13}}>
          Still working. Big pages can take up to 30 seconds.
        </p>
      )}
    </div>
  );
}