import { ThemeToggle } from "./GlobalStyles";

// Material Symbols outlined home icon; the theme control uses the shared component.
const HOME = "M12 5.69l5 4.5V18h-2v-6H9v6H7v-7.81l5-4.5M12 3L2 12h3v8h6v-6h2v6h6v-8h3L12 3z";

type Props = {
  onHome?: () => void;
  className?: string;
};

export default function Header({ onHome, className = "theme-toolbar" }: Props) {
  return (
    <div className={className}>
      {onHome && (
        <button type="button" className="icon-button" onClick={onHome} aria-label="Start over" title="Start over">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d={HOME} /></svg>
        </button>
      )}
      <ThemeToggle />
    </div>
  );
}
