// One place for colors, spacing, focus outlines and narrow-width rules.
const css = `
  :root {
    --text: #1f1f1f;
    --border: #767676;      /* 4.5:1 on white, passes for input borders */
    --primary: #1558b0;     /* white text on this is above 7:1 */
    --primary-hover: #0f4590;
    --focus: #0b57d0;
    --danger: #b00020;
  }

  body {
    margin: 0;
    background: #fff;
    color: var(--text);
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    font-size: 14px;
    line-height: 1.45;
  }

  .app { padding: 16px; max-width: 640px; margin: 0 auto; }

  h1, h2, p, li { overflow-wrap: anywhere; }
  h1 { margin: 0 0 8px; }
  h2 { margin: 16px 0 8px; }

  label { display: block; font-weight: 600; margin-bottom: 4px; }

  input[type="text"], input[type="date"], input[type="datetime-local"], textarea {
    font: inherit;
    padding: 6px 8px;
    border: 1px solid var(--border);
    border-radius: 6px;
    max-width: 100%;
    box-sizing: border-box;
  }
  input[type="checkbox"] { width: 18px; height: 18px; margin-right: 6px; vertical-align: middle; }

  button {
    font: inherit;
    min-height: 36px;
    padding: 6px 12px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: #fff;
    color: var(--text);
    cursor: pointer;
  }
  button:hover:not(:disabled) { background: #f1f3f4; }
  button.primary { background: var(--primary); border-color: var(--primary); color: #fff; }
  button.primary:hover:not(:disabled) { background: var(--primary-hover); }
  button:disabled, button.primary:disabled {
    background: #eee; border-color: #ccc; color: #6b6b6b; cursor: not-allowed;
  }

  a { color: #0b57d0; }
  summary { cursor: pointer; }

  /* A clear outline for keyboard users on every control. */
  :focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; }
  /* Headings that we focus from code don't need an outline. */
  [tabindex="-1"]:focus { outline: none; }

  /* Hidden on screen, read by screen readers. */
  .sr-only {
    position: absolute; width: 1px; height: 1px; overflow: hidden;
    clip: rect(0 0 0 0); white-space: nowrap;
  }

  /* Narrow panel */
  @media (max-width: 360px) {
    .app { padding: 8px; }
    button.primary { width: 100%; }
  }
`;

export default function GlobalStyles() {
  return <style>{css}</style>;
}