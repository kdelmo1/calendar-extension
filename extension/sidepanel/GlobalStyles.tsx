import { useEffect, useSyncExternalStore } from "react";

export type Theme = "light" | "dark";
export const THEME_STORAGE_KEY = "calibrateTheme";
const systemTheme = (): Theme => window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
let theme: Theme = typeof window === "undefined" ? "light" : systemTheme();
let preference: Theme | null = null;
let revision = 0;
const listeners = new Set<() => void>();

function applyTheme(next: Theme) {
  theme = next;
  document.documentElement.dataset.theme = next;
  for (const notify of listeners) notify();
}
function subscribe(notify: () => void) {
  listeners.add(notify);
  return () => { listeners.delete(notify); };
}

// UI state only: no runtime messages or capture/calendar behavior changes.
export function toggleTheme() {
  preference = theme === "dark" ? "light" : "dark";
  revision++;
  applyTheme(preference);
  if (typeof chrome !== "undefined" && chrome.storage?.local) {
    void chrome.storage.local.set({ [THEME_STORAGE_KEY]: preference }).catch(() => {});
  }
}
export function useTheme() {
  const current = useSyncExternalStore(subscribe, () => theme, () => "light" as Theme);
  return { theme: current, toggleTheme };
}
export function ThemeToggle() {
  const { theme: current } = useTheme();
  const label = current === "dark" ? "Switch to light mode" : "Switch to dark mode";
  return (
    <button type="button" className="icon-button theme-toggle" onClick={toggleTheme} aria-label={label} title={label}>
      <span className="material-symbols-outlined" aria-hidden="true">
        {current === "dark" ? "light_mode" : "dark_mode"}
      </span>
    </button>
  );
}
export function CalibrateLogo() {
  return <span className="brand-mark" aria-hidden="true" />;
}

export const css = `
  @font-face {
    font-family: Roboto; font-style: normal; font-weight: 400; font-display: swap;
    src: url('/calibrate/fonts/roboto-400.ttf') format('truetype');
  }
  @font-face {
    font-family: Roboto; font-style: normal; font-weight: 500; font-display: swap;
    src: url('/calibrate/fonts/roboto-500.ttf') format('truetype');
  }
  @font-face {
    font-family: 'Material Symbols Outlined'; font-style: normal; font-weight: 400; font-display: block;
    src: url('/calibrate/fonts/material-theme-icons.ttf') format('truetype');
  }
  :root {
    color-scheme: light;
    --background: #FFFFFF;
    --surface: #FFFFFF;
    --text: #000000;
    --text-secondary: #5F5F5F;
    --divider: #E0E0E0;
    --accent: #1A73E8;
    --on-accent: #FFFFFF;
    --field-border: #5F5F5F;
    --selected-background: #FFFFFF;
    --disabled-background: #E0E0E0;
    --disabled-text: #5F5F5F;
    --font-family: Roboto, system-ui, sans-serif;
    --font-title: 20px;
    --font-brand: 24px;
    --brand-line-height: 1.25;
    --font-body: 14px;
    --font-secondary: 12px;
    --font-regular: 400;
    --font-medium: 500;
    --line-height: 1.5;
    --space-0: 0px;
    --space-1: 8px;
    --space-2: 16px;
    --space-3: 24px;
    --space-4: 32px;
    --space-5: 40px;
    --space-6: 48px;
    --radius-card: 12px;
    --radius-field: 16px;
    --radius-pill: 999px;
    --border-width: 1px;
    --focus-width: 2px;
    --focus-offset: 2px;
    --control-height: 40px;
    --field-height: 48px;
    --icon-size: 20px;
    --logo-size: 40px;
    --logo-mask: url('/calibrate/icons/calibrate-128.png');
    --checkbox-size: 16px;
    --progress-height: 4px;
    --panel-max-width: 640px;
    --panel-padding: var(--space-3);
    --motion-duration: 180ms;
    --motion-easing: ease-out;
    --shadow: none;
    /* Compatibility aliases for existing screens during Lane 4's migration. */
    --primary: var(--accent);
    --primary-hover: var(--accent);
    --focus: var(--accent);
    --border: var(--divider);
    --danger: var(--text);
    --secondary: var(--text-secondary);
    --muted: var(--text-secondary);
    --bg: var(--background);
  }
  :root[data-theme="dark"] {
    color-scheme: dark;
    --background: #121212;
    --surface: #1E1E1E;
    --text: #FFFFFF;
    --text-secondary: #B3B3B3;
    --divider: #2C2C2C;
    --accent: #8AB4F8;
    --on-accent: #000000;
    --field-border: #B3B3B3;
    --selected-background: #1E1E1E;
    --disabled-background: #2C2C2C;
    --disabled-text: #B3B3B3;
  }
  * { box-sizing: border-box; }
  html, body, #root { min-height: 100%; }
  html, body, #root { width: 100%; min-width: 0; }
  body {
    margin: var(--space-0); background: var(--background); color: var(--text);
    font-family: var(--font-family); font-size: var(--font-body);
    font-weight: var(--font-regular); line-height: var(--line-height);
  }
  .app { position: relative; width: 100%; min-width: 0; padding: var(--panel-padding); max-width: var(--panel-max-width); margin: var(--space-0) auto; }
  h1, h2, p, li { overflow-wrap: anywhere; }
  h1, h2 { font-size: var(--font-title); font-weight: var(--font-medium); line-height: var(--line-height); }
  h1 { margin: var(--space-0) var(--space-0) var(--space-2); }
  h2 { margin: var(--space-3) var(--space-0) var(--space-1); }
  p { margin: var(--space-0) var(--space-0) var(--space-2); }
  small, .secondary-text { font-size: var(--font-secondary); color: var(--text-secondary); }
  strong, b, label { font-weight: var(--font-medium); }
  label { display: block; margin-bottom: var(--space-1); }
  input, textarea, select, button { font: inherit; }
  input[type="text"], input[type="date"], input[type="datetime-local"], textarea, select {
    padding: var(--space-1) var(--space-2); min-height: var(--field-height);
    border: var(--border-width) solid var(--field-border); border-radius: var(--radius-field);
    background: var(--surface); color: var(--text); max-width: 100%;
  }
  textarea { resize: vertical; }
  ::placeholder { color: var(--text-secondary); opacity: 1; }
  input[type="checkbox"] {
    width: var(--checkbox-size); height: var(--checkbox-size);
    margin: var(--space-0) var(--space-1) var(--space-0) var(--space-0);
    vertical-align: middle; accent-color: var(--accent);
  }
  input[type="file"] { color: var(--text-secondary); max-width: 100%; }
  button, input[type="file"]::file-selector-button {
    min-height: var(--control-height); padding: var(--space-1) var(--space-2);
    border: var(--border-width) solid transparent; border-radius: var(--radius-pill);
    background: transparent; color: var(--accent); font-weight: var(--font-medium); cursor: pointer;
    transition: opacity var(--motion-duration) var(--motion-easing);
  }
  button:hover:not(:disabled), a:hover { text-decoration: underline; text-underline-offset: var(--focus-offset); }
  button.primary:hover:not(:disabled), .icon-button:hover:not(:disabled) { text-decoration: none; }
  button.primary, .button-primary { background: var(--accent); border-color: var(--accent); color: var(--on-accent); }
  button.primary:hover:not(:disabled) { background: var(--accent); }
  button:disabled, button.primary:disabled {
    background: var(--disabled-background); border-color: var(--divider);
    color: var(--disabled-text); cursor: not-allowed;
  }
  a { color: var(--accent); text-underline-offset: var(--focus-offset); }
  summary { cursor: pointer; }
  :focus-visible { outline: var(--focus-width) solid var(--focus); outline-offset: var(--focus-offset); }
  [tabindex="-1"]:focus:not(:focus-visible) { outline: none; }
  .card, .event-card {
    padding: var(--space-2); margin-bottom: var(--space-2);
    border: var(--border-width) solid var(--divider); border-radius: var(--radius-card);
    background: var(--surface); box-shadow: var(--shadow);
  }
  .selected, [aria-selected="true"] { border-color: var(--accent); background: var(--selected-background); }
  .app-header {
    display: flex; align-items: center; gap: var(--space-2);
    padding-top: var(--space-1); padding-bottom: var(--space-3); margin-bottom: var(--space-3);
    border-bottom: var(--border-width) solid var(--divider);
  }
  .app-header .brand-name {
    min-width: 0; overflow-wrap: anywhere; font-size: var(--font-brand);
    font-weight: var(--font-medium); line-height: var(--brand-line-height);
  }
  .app-header .theme-toggle { margin-left: auto; }
  .brand-mark {
    display: inline-block; width: var(--logo-size); height: var(--logo-size); flex-shrink: 0;
    background: var(--accent);
    -webkit-mask: var(--logo-mask) center / contain no-repeat;
    mask: var(--logo-mask) center / contain no-repeat;
  }
  .icon-button {
    display: inline-flex; align-items: center; justify-content: center;
    width: var(--control-height); height: var(--control-height); padding: var(--space-0);
    color: var(--text); flex-shrink: 0;
  }
  .theme-toggle { border-color: var(--divider); background: var(--surface); }
  .theme-toolbar { display: flex; justify-content: flex-end; gap: var(--space-1); margin-bottom: var(--space-2); }
  .icon-button svg { width: var(--icon-size); height: var(--icon-size); fill: currentColor; }
  .theme-toolbar-input { position: absolute; top: var(--panel-padding); right: var(--panel-padding); margin: var(--space-0); }
  .material-symbols-outlined {
    font-family: 'Material Symbols Outlined'; font-style: normal; font-weight: var(--font-regular);
    font-size: var(--icon-size); line-height: 1; letter-spacing: normal;
    text-transform: none; white-space: nowrap; direction: ltr;
    font-feature-settings: 'liga'; -webkit-font-smoothing: antialiased;
  }
  .linear-progress {
    height: var(--progress-height); width: 100%; overflow: hidden;
    background: var(--divider); border-radius: var(--radius-pill);
  }
  .linear-progress::after {
    content: ''; display: block; width: 40%; height: 100%; background: var(--accent);
    animation: calibrate-fade-in var(--motion-duration) var(--motion-easing);
  }
  .results-enter { animation: calibrate-fade-in var(--motion-duration) var(--motion-easing); }
  /* Keep App's focus/announcement target without a duplicate visible title. */
  .app > h1 {
    position: absolute; width: var(--border-width); height: var(--border-width);
    padding: var(--space-0); margin: calc(-1 * var(--border-width)); overflow: hidden;
    clip-path: inset(50%); white-space: nowrap;
  }
  .review-screen { display: grid; min-width: 0; gap: var(--space-3); }
  .review-screen h2 { margin: var(--space-0) var(--space-0) var(--space-2); }
  .review-screen input[type="text"], .event-card input { width: 100%; min-width: 0; }
  .review-screen ul { list-style: none; padding: var(--space-0); margin: var(--space-0); }
  .section-count { color: var(--text-secondary); font-size: var(--font-secondary); font-weight: var(--font-regular); }
  .review-edit { padding-bottom: var(--space-3); border-bottom: var(--border-width) solid var(--divider); }
  .review-edit button { margin-top: var(--space-1); }
  .edit-note { margin: var(--space-1) var(--space-0) var(--space-0); color: var(--text); }
  .event-card { list-style: none; display: grid; gap: var(--space-2); }
  .event-card label { font-size: var(--font-secondary); color: var(--text-secondary); }
  .event-date-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: var(--space-2); }
  .event-date-grid input { padding-inline: var(--space-1); }
  .event-card .checkbox-label { display: flex; align-items: center; color: var(--text); margin: var(--space-0); font-size: var(--font-body); }
  .event-card input[type="checkbox"] { width: var(--checkbox-size); }
  .event-actions { display: flex; align-items: start; justify-content: space-between; gap: var(--space-1); }
  .event-actions details { min-width: 0; flex: 1; padding-top: var(--space-1); }
  .event-actions summary { color: var(--text-secondary); font-size: var(--font-secondary); }
  .event-source { color: var(--text-secondary); font-size: var(--font-secondary); margin: var(--space-1) var(--space-0) var(--space-0); }
  .review-footer { display: grid; gap: var(--space-1); }
  .review-footer .primary { width: 100%; }
  .input-screen { display: grid; gap: var(--space-3); min-width: 0; }
  .input-screen h1 {
    display: flex; align-items: center; min-height: var(--control-height);
    padding-right: calc(var(--control-height) + var(--space-2)); margin-bottom: var(--space-1);
  }
  .input-screen h1[tabindex="-1"]:focus { outline: none; }
  .input-intro p { margin: var(--space-0); color: var(--text-secondary); }
  .input-screen h2 { margin: var(--space-0) var(--space-0) var(--space-1); font-size: var(--font-body); }
  .upload-area {
    min-width: 0; padding: var(--space-2);
    border: var(--border-width) solid var(--divider); border-radius: var(--radius-card);
    background: var(--surface);
  }
  .upload-help { margin: var(--space-0) var(--space-0) var(--space-2); }
  .file-picker { display: grid; min-width: 0; gap: var(--space-1); }
  .file-picker-button { justify-self: start; max-width: 100%; border-color: var(--divider); background: var(--background); }
  .file-status { margin: var(--space-0); font-size: var(--font-secondary); color: var(--text-secondary); overflow-wrap: anywhere; }
  .paste-area { min-width: 0; }
  .paste-area textarea { display: block; width: 100%; }
  .paste-area .primary { width: 100%; margin-top: var(--space-2); }
  .input-problem { margin: var(--space-0); color: var(--text); }
  .result-screen { display: grid; min-width: 0; gap: var(--space-3); }
  .result-screen h1 { margin: var(--space-0); }
  .result-screen h1[tabindex="-1"]:focus { outline: none; }
  .result-count { margin: var(--space-1) var(--space-0) var(--space-0); color: var(--text-secondary); }
  .calendar-link { color: var(--text); text-decoration: none; }
  .calendar-link:hover { color: var(--accent); text-decoration: underline; }
  .added-event-list, .failure-list { list-style: none; padding: var(--space-0); margin: var(--space-0); }
  .added-event-list li {
    display: grid; gap: var(--space-1); padding: var(--space-2) var(--space-0);
    border-bottom: var(--border-width) solid var(--divider);
  }
  .added-event-list li:first-child { padding-top: var(--space-0); }
  .event-title { display: block; font-weight: var(--font-medium); overflow-wrap: anywhere; }
  .event-timezone { margin: var(--space-2) var(--space-0) var(--space-0); }
  .result-issue {
    min-width: 0; border: var(--border-width) solid var(--divider);
    border-radius: var(--radius-card); padding: var(--space-2); background: var(--surface);
  }
  .result-issue h2 { font-size: var(--font-body); margin: var(--space-0) var(--space-0) var(--space-1); }
  .error-reason, .failure-list p { margin: var(--space-0); white-space: pre-wrap; overflow-wrap: anywhere; }
  .failure-list li + li { margin-top: var(--space-2); }
  .failure-list p { margin-top: var(--space-1); font-size: var(--font-secondary); color: var(--text-secondary); }
  .result-actions { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-1); }
  .calendar-open {
    display: inline-flex; align-items: center; justify-content: center;
    min-height: var(--control-height); padding: var(--space-1) var(--space-2);
    border-radius: var(--radius-pill); text-align: center; text-decoration: none;
    font-weight: var(--font-medium);
  }
  @keyframes calibrate-fade-in { from { opacity: 0; } to { opacity: 1; } }
  .sr-only {
    position: absolute; width: var(--border-width); height: var(--border-width);
    padding: var(--space-0); margin: calc(-1 * var(--border-width)); overflow: hidden;
    clip-path: inset(50%); white-space: nowrap; border: none;
  }
  @media (max-width: 360px) {
    :root { --panel-padding: var(--space-2); }
    button.primary { width: 100%; }
  }
  @media (max-width: 340px) { .event-date-grid { grid-template-columns: minmax(0, 1fr); } }
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after { animation: none !important; transition: none !important; scroll-behavior: auto !important; }
  }
`;

export default function GlobalStyles() {
  useEffect(() => {
    let active = true;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const initialRevision = revision;
    applyTheme(preference ?? systemTheme());
    const followSystem = () => { if (preference === null) applyTheme(systemTheme()); };
    const followStorage = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area !== "local" || !(THEME_STORAGE_KEY in changes)) return;
      const next = changes[THEME_STORAGE_KEY].newValue;
      preference = next === "light" || next === "dark" ? next : null;
      revision++;
      applyTheme(preference ?? systemTheme());
    };
    media.addEventListener("change", followSystem);
    if (typeof chrome !== "undefined" && chrome.storage?.local) {
      chrome.storage.onChanged.addListener(followStorage);
      void chrome.storage.local.get(THEME_STORAGE_KEY).then(saved => {
        // Do not let a late storage read undo a user's new toggle choice.
        if (!active || revision !== initialRevision) return;
        const next = saved[THEME_STORAGE_KEY];
        preference = next === "light" || next === "dark" ? next : null;
        applyTheme(preference ?? systemTheme());
      }).catch(() => {});
    }
    return () => {
      active = false;
      media.removeEventListener("change", followSystem);
      if (typeof chrome !== "undefined" && chrome.storage?.onChanged) chrome.storage.onChanged.removeListener(followStorage);
    };
  }, []);
  return <style>{css}</style>;
}
