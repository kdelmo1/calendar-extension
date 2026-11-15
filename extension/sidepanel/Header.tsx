import { useTheme } from "./GlobalStyles"; // Lane 1's hook. If the name differs, change this line only.

// Material Symbols (outlined) paths.
const MOON =
  "M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9 9-4.03 9-9c0-.46-.04-.92-.1-1.36-.98 1.37-2.58 2.26-4.4 2.26-2.98 0-5.4-2.42-5.4-5.4 0-1.81.89-3.42 2.26-4.4-.44-.06-.9-.1-1.36-.1z";
const SUN =
  "M12 9c1.65 0 3 1.35 3 3s-1.35 3-3 3-3-1.35-3-3 1.35-3 3-3m0-2c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zM2 13h2c.55 0 1-.45 1-1s-.45-1-1-1H2c-.55 0-1 .45-1 1s.45 1 1 1zm18 0h2c.55 0 1-.45 1-1s-.45-1-1-1h-2c-.55 0-1 .45-1 1s.45 1 1 1zM11 2v2c0 .55.45 1 1 1s1-.45 1-1V2c0-.55-.45-1-1-1s-1 .45-1 1zm0 18v2c0 .55.45 1 1 1s1-.45 1-1v-2c0-.55-.45-1-1-1s-1 .45-1 1zM5.99 4.58a.996.996 0 00-1.41 0 .996.996 0 000 1.41l1.06 1.06c.39.39 1.03.39 1.41 0s.39-1.03 0-1.41L5.99 4.58zm12.37 12.37a.996.996 0 00-1.41 0 .996.996 0 000 1.41l1.06 1.06c.39.39 1.03.39 1.41 0a.996.996 0 000-1.41l-1.06-1.06zm1.06-10.96a.996.996 0 000-1.41.996.996 0 00-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06zM7.05 18.36a.996.996 0 000-1.41.996.996 0 00-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06z";

const HOME =
  "M12 5.69l5 4.5V18h-2v-6H9v6H7v-7.81l5-4.5M12 3L2 12h3v8h6v-6h2v6h6v-8h3L12 3z";
  
type Props = {
    onHome?:() => void;
};

export default function Header({onHome}: Props) {
  const { theme, toggle } = useTheme();
  const isDark = theme === "dark";
  // Lane 1 adds icons/icon-32.png. Decorative, because the name is next to it.
  const logo =
    typeof chrome !== "undefined" && chrome.runtime?.getURL
      ? chrome.runtime.getURL("icons/icon-32.png")
      : "";

  return (
    <header className="cal-header">
      <span className="cal-brand">
        {logo && <img src={logo} alt="" />}
        Calibrate
      </span>
      {onHome && (
       <button
          type="button"
          className="cal-icon-btn"
          onClick={onHome}
          aria-label="Start over"
          title="Start over"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d={HOME} />
          </svg>
        </button> 
      )}
       <button
        type="button"
        className="cal-icon-btn"
        onClick={toggle}
        aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d={isDark ? SUN : MOON} />
        </svg>
      </button>
    </header>
  );
}
