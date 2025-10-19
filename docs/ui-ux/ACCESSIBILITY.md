Accessibility and UX Notes

- Color and Contrast
  - Primary buttons use `brand-600/700` on white text; contrast ratio exceeds WCAG AA for normal text on interactive controls.
  - Text on light backgrounds uses Slate 900/700; on dark backgrounds uses Slate 100/300.
  - Focus states: all inputs and buttons include visible focus rings.

- Dark Mode
  - Tailwind configured with `darkMode: 'class'` (see `frontend/tailwind.config.cjs`).
  - Initial theme is chosen from `localStorage.theme` or `prefers-color-scheme` to avoid FOUC (inline script in `frontend/index.html`).
  - Toggle button persists preference and updates `document.documentElement.classList`.

- Keyboard Navigation
  - “Skip to content” link in the header (visible on focus).
  - Forms labels are linked to inputs; buttons have accessible labels; feedback area uses `aria-live="polite"`.

- Motion and Decoration
  - Decorative blobs are non-interactive and reduced in opacity; they adapt in dark mode.

Checklist
- Headings follow a logical order (h1 in hero, h2 in cards/sections).
- Sufficient hit area for interactive controls (≥ 32px in height).
- No color-only information; text and icons provide meaning.
- Components remain readable at 200% zoom.

