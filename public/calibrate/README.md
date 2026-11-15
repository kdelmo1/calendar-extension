# Calibrate UI assets and Lane 4 handoff

Lane 1 supplies `extension/sidepanel/GlobalStyles.tsx`, branding in the manifest/menu, and these assets. Follow-up polish styles `InputScreen.tsx`, `EventCard.tsx`, and `ReviewScreen.tsx`. At the user's request, `App.tsx` now also mounts the shared brand header and theme toggle; Belinda's navigation and error recovery work is not implemented here. All capture, parser, Calendar, runtime message contracts, and review handlers are unchanged.

The follow-up light accent is `#1A73E8` with white button text (4.51:1); dark uses `#8AB4F8` with black button text (9.96:1). Fields have 16px corners. Start/end dates sit side-by-side when space allows and stack below 340px. The existing direct-child review heading is visually hidden, preserving its screen-reader/focus role without editing `App.tsx`.

## Header integration (Lane 4)

Keep the existing `<GlobalStyles />` mounted once. It applies the theme, follows the system until an explicit choice is saved, and listens for storage changes. `App.tsx` now includes this header once; extend it for navigation rather than adding a second header:

```tsx
import { CalibrateLogo, ThemeToggle } from "./GlobalStyles";

<header className="app-header">
  <CalibrateLogo />
  <span className="brand-name">Calibrate</span>
  <ThemeToggle />
</header>
```

`ThemeToggle` has an accessible action label and uses the bundled outlined Material sun/moon symbols. `useTheme()` also exposes `{ theme, toggleTheme }` if you need to render your own header button. The choice is stored in `chrome.storage.local.calibrateTheme` as `light` or `dark`; there are no new runtime messages. Removing that key restores system-following mode. The logo uses the PNG alpha as a mask so its blue automatically matches the active theme.

## Tokens

Use `var(--...)` in screen CSS and inline styles. Remove every old literal color and replace font weights above 500.

| Purpose | Variable |
| --- | --- |
| Page / card background | `--background` / `--surface` |
| Main / secondary text | `--text` / `--text-secondary` |
| Divider / outlined input | `--divider` / `--field-border` |
| Blue / text on blue | `--accent` / `--on-accent` |
| Focus ring | `--focus` |
| 20 / 14 / 12px type | `--font-title` / `--font-body` / `--font-secondary` |
| Regular / medium weight | `--font-regular` / `--font-medium` |
| 0 / 8 / 16 / 24 / 32 / 40 / 48px spacing | `--space-0` through `--space-6` |
| Card / input / button radius | `--radius-card` / `--radius-field` / `--radius-pill` |
| Motion | `--motion-duration` / `--motion-easing` |

Existing `--primary`, `--primary-hover`, `--border`, `--danger`, `--secondary`, `--muted`, and `--bg` aliases remain available. Error text is monochrome; it must also have a visible error label, not rely on color.

Classes supplied: `.primary` for filled blue buttons; default buttons for blue text actions; `.icon-button`; `.card` / `.event-card`; `.secondary-text`; `.selected`; `.results-enter`; `.linear-progress`; `.sr-only`. Set the progress element's existing accessible status in the screen; it is a thin indeterminate indicator, not a numeric percentage. Motion is 180ms ease-out and disabled for reduced motion. No shadows, gradients, or second accent.

## Fonts and icons

Roboto 400/500 and the two Material Symbols glyphs are bundled locally from Google Fonts, with licenses in `fonts/`. No Google Fonts connection or new permissions are required. The Material font is subset to `dark_mode` and `light_mode` only; do not use it for other icon names without extending the subset.

`icons/calibrate.svg` is the editable source for the original calendar-shaped C mark. The 16/32/48/128 PNGs have real transparency and one solid blue hue. Both `manifest.icons` and `action.default_icon` point to the PNGs. Vite copies the whole `public/` tree into `dist/`.

## Verification after Lane 4 merges

1. `npm run build`, then reload the unpacked `dist/` extension.
2. Confirm the extension is named **Calibrate**, its tooltip is **Open Calibrate**, and the selection/image menu says **Add dates with Calibrate**.
3. With `calibrateTheme` absent, check both system themes. Toggle once, close/reopen the panel, and confirm the explicit choice remains.
4. Check both modes at 320px width, keyboard focus, and reduced motion. Old screen inline colors must be removed by Lane 4 first.
5. In both modes: highlight → review → one plain-English edit → Add to Google Calendar → Undo. This must use the real integrated screens; a theme fixture is not an end-to-end test.
