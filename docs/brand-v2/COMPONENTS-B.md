# DRVO AutoRespond — Brand V2 Components, Batch B

Related: [Master #119](https://github.com/tarek-saad-dev/drvowa-autoresponse/issues/119) · [Component Phase #123](https://github.com/tarek-saad-dev/drvowa-autoresponse/issues/123)

## Scope

This batch completes the remaining **shared UI primitives** and removes the last direct Teal shadows in the shared app chrome. It does not restructure routes, data fetching, invoices, WhatsApp, AI or business logic.

| Surface | Change | Contract |
| --- | --- | --- |
| Card | Consistent 2xl radius / spacing and stronger heading | Preserves the same exported components and props |
| Badge | More legible density; keeps distinct success/warning/info/muted backgrounds | Preserves status color meanings |
| Progress | Finite-safe calculations, accessible unlimited status, reduced-motion transition | Preserves `value`, `max`, `label` API and amber near-limit |
| EmptyState | Unified card radius, text hierarchy and existing action slot | Action remains interactive |
| DrvoLoading | Removes the old fixed Teal box-shadow, uses semantic shadow | Preserves nonblocking page/inline variants and reduced-motion CSS |
| AppIcon | Shared SVG stroke weight for home/inbox/employee/settings/billing/integrations/admin/theme | No dependency or icon font download |
| Sidebar / mobile navigation | Reuses icons; removes hardcoded Teal shadows; preserves links and active states | Existing route model in `constants/nav.ts` remains untouched |
| ThemeToggle | Uses actual sun/moon SVG, not Unicode glyphs | Existing toggle and preference persistence unchanged |

## Quality gates

- The main branded accent remains `--primary`, not a hex color in component markup.
- Contextual warning/info/error/WhatsApp and third-party colors remain distinct.
- Controls preserve keyboard focus and screen-reader labels.
- New `tests/unit/brand-v2-primitives.test.tsx` tests status distinctions, numeric edge cases, loader, components and SVG icons.
- `npm run typecheck`, `npm run build`, `npm test` and the GitHub PR workflow must pass.
- Authenticated visual snapshots (light/dark, RTL, mobile) remain an explicit **final pre-production** release gate; do not claim browser verification from unit tests.

## Next area

Phase 03 — Public Landing and Promo. Public styling has independent CSS and animated Canvas colors which require a separate implementation PR. **Do not merge the draft integration PR #121 into `main` until product-wide migration and visual QA are complete.**
