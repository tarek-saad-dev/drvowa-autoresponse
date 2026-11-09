# DRVO AutoRespond Brand V2 — Component System (P02 / batch A)

## Shared interaction decisions

This phase extends the existing semantic token foundation **without changing data, APIs or business logic**.

- `Button`: all existing variants and sizes remain API-compatible. Adds optional `loading` (disabled + aria-busy + spinner). Primary uses semantic `text-primary-foreground` for both the dark neon and readable light green. Focus outline is visible without relying on hover.
- `Input`, `Textarea`, `Select`: share `fieldBaseClass` and `fieldInteractionClass` in `src/components/ui/field-styles.ts`. Input borders, focus, `aria-invalid`, disabled, and reduced-motion styles stay consistent across the whole product. Existing props/refs are preserved.
- `Accordion`: native buttons already support Enter/Space via click activation; removed a redundant keyboard handler that could double-toggle. Uses semantic focus ring and reduced-motion classes.
- `ThemeToggle`: publishes current dark/light selected state via `aria-pressed` and honors reduced motion.
- `Alert`: warning/error are assertive `role=alert`; informational and success messages are polite `role=status` to avoid disruptive screen reader announcements.
- Other elements (Badge, Card, Progress, EmptyState, loading, navigation glyphs) remain on existing semantic tokens. Review them in the next P02 batch or their designated screen phase; don't churn styles without measurable UX benefit.

## Quality gates

- No static Teal hex introduced.
- Old Button/Input/Select/Textarea API remains valid at every import site.
- Light/dark rely exclusively on Brand V2 semantic tokens, including status and third-party branding exceptions.
- Keyboard focus, disabled/invalid/busy states and reduced motion covered.
- Vitest contract `tests/unit/brand-v2-controls.test.tsx` verifies component SSR classes/ARIA.
- CI typecheck/build/test must succeed before merging to integration.
- Browser snapshots and full final UI audit remain pre-production requirements.

See Issue #123 and master tracker #119.
