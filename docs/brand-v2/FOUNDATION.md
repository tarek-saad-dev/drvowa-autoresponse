# DRVO AutoRespond — Brand V2 Foundation (P01)

**Integration:** `feat/brand-v2` | **PR:** #122 | **Master tracker:** #119 | **P01 issue:** #120

## Implementation notes

- The six brand foundation values are exactly as approved: **Ink** `#0B0F14`, **Carbon** `#151B23`, **Soft White** `#F7F9FC`, **Mist Gray** `#DCE3EA`, **Signal Green** `#7BF36A`, **Deep Green** `#1F9D55`.
- The CSS now maps semantic roles (`primary`, `background`, `card`, `border`, `ring`, `surface`, `sidebar`, `info`, `warning`, `success`, `destructive`) for both themes, rather than directly choosing a brand accent in individual screens.
- On light surfaces, primary is an **accessible derivative** `#188342` (not a new brand palette color); hover is `#116833`. Dark primary is the approved `#7BF36A`. Hover `#A3F78D` is a derived state.
- Other brand shades, selected/translucent states and off-white gradients are generated from the foundation color system; they are not new core brand tokens.
- Input boundaries now use `#8895A1` (light on white, 3.06:1) and `#64717F` (dark on Carbon, 3.47:1) to support WCAG non-text contrast, instead of faint borders.
- Shadow role variables are `--elevation-sm` and `--elevation-md`, mapped to Tailwind shadow tokens without recursive `--shadow-*` references.
- Functional colors remain distinct. Do not flatten errors, warnings, information, WhatsApp bubbles, avatar categories or third-party InstaPay colors into neon green.
- Typography: the app retains its actual IBM Plex Sans Arabic and Space Grotesk loaders. `--font-ui-arabic`, `--font-display-arabic`, `--font-display-latin` and `--font-data` are now role tokens. Approved Bold Editorial lettering is **not** a font asset. Do not claim typography is final until the actual approved/licensed assets are available.
- Brand logo PNG assets are unchanged until official export is supplied. No guessed custom logo should be deployed.
- The old custom-property names `--brand-teal`, `--brand-teal-strong`, `--brand-teal-deep` are temporarily aliased to the new system, because some Canvas and Landing pieces still read them. Remove the aliases only after later phases migrate those components.
- `globals.css` glow/3D story styles now draw from the active semantic primary rather than the old cyan RGB values. Other modules (`landing.module.css`, onboarding and promo CSS) are explicitly out of scope for this first PR and will be addressed in P03/P04.

## Text contrast examples (WCAG relative luminance)

| Foreground | Background | Approx ratio | Use |
| --- | --- | ---: | --- |
| `#188342` | `#FFFFFF` | 4.81:1 | Light primary text/button |
| `#FFFFFF` | `#188342` | 4.81:1 | Light primary button label |
| `#7BF36A` | `#0B0F14` | 13.61:1 | Dark signal |
| `#0B0F14` | `#7BF36A` | 13.61:1 | Dark primary button label |
| `#4D5966` | `#F7F9FC` | 6.78:1 | Light muted text |
| `#A8B3BE` | `#0B0F14` | 9.02:1 | Dark muted text |

The new Vitest test asserts text ratios >=4.5:1 for representative theme combinations. This is not a substitute for a full browser-level audit of every state.

## Regression gate

```bash
npm run typecheck
npm run build
npm test
node scripts/brand-v2-audit.mjs --json
```

The integration branch has a PR validation workflow in `.github/workflows/validate-pr.yml`. After the P01 PR CI passes, perform before/after visual review of real pages across light/dark and required mobile widths. Production is **not** affected until final integration PR is approved and merged into main.
