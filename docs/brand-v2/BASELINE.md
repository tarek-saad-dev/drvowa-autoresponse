# DRVO AutoRespond Brand V2 — Audit Baseline

> Captured: 2026-11-10 from `main` commit `f60a61cec837b2847b1629fa38cc69221e4667fb`.  
> Scope: source-only static audit; **no browser screenshot or full build/test run yet**.

## Observed code facts

| Source | Verified baseline |
| --- | --- |
| `src/app/globals.css` | 423 lines; 79 hexadecimal color occurrences, 62 distinct hex values; primary Teal `#00759a`, dark primary `#0b8bb5`. |
| `src/app/layout.tsx` | IBM Plex Sans Arabic + Space Grotesk; `themeColor` contains Teal `#00759a`. |
| `src/components/landing/landing.module.css` | 1,974 lines; 242 hexadecimal color occurrences, 231 distinct hex values; standalone dark/Cyan palette. |
| `src/components/onboarding/onboarding-theme.css` | 450 lines; Cyan `#3de7ff`; imported `@dawod/thmanyah-font-web`; standalone theme overrides. |
| `src/app/promo/[code]/promo.module.css` | 81 lines; 71 hexadecimal color occurrences across 70 unique values. |
| `src/components/dashboard/inbox-panel.tsx` | 1,594 lines; 20 hard-coded hex values; at least one old user-facing `AutoResponse`; direct Teal grid effect. |
| `src/components/dashboard/billing-plans-client.tsx` | Independent InstaPay purple branding; this is **intentional**, not a Teal migration defect. |
| `src/components/landing/conversation-flow.tsx` | Canvas reads `--brand-teal` with direct Teal/Cyan gradient values; needs manual treatment. |
| `src/app/promo/[code]/promo-landing.tsx` | Multiple old user-facing `DRVO AutoResponse` labels. |
| `src/constants/app.ts` | `APP_NAME = "DRVO AutoRespond"` already correct; **do not** rename internal `APP_SERVICE_ID`. |

## Before/after test candidates

- **Marketing:** `/`, pricing, animated hero, `/promo/[code]`.
- **Auth:** `/login`, `/signup`, `/forgot-password`, `/reset-password`.
- **Activation:** `/choose-plan`, `/onboarding`, `/onboarding/preview`.
- **Dashboard:** `/dashboard`, `/dashboard/settings`, `/dashboard/billing`.
- **Conversation:** `/dashboard/inbox` (list, thread, mobile composer, human-owned, AI-owned, empty state).
- **Agent:** `/dashboard/agent`, knowledge editor, campaign compose/send.
- **Admin:** `/admin`, `/admin/discount-codes`, `/admin/payments`, `/admin/refunds`, `/admin/subscriptions`.

## Current status / evidence needed

- **Verified:** source-file audit and integration branch created.
- **Verified:** Brand Guidelines v1.0 has six palette values and approves Bold Editorial direction; final fonts/vector logo are still pending production approval.
- **Verified:** existing `feat/brand-theme-light-dark` is diverged (6 ahead / 236 behind main), so it is not the migration base.
- **Pending:** screenshots in authenticated preview for routes and interaction states.
- **Pending:** run `node scripts/brand-v2-audit.mjs` on cloned branch and record the report. Script is added in this phase, but counts are **not** claimed as executed CI output.
- **Pending:** `npm run typecheck`, `npm run build`, `npm test`, Playwright screenshots on actual branch.
- **Pending:** final licensed display font / vector logo files; retain current brand images until approved.

## Audit command

```bash
node scripts/brand-v2-audit.mjs > brand-v2-audit.md
node scripts/brand-v2-audit.mjs --json > brand-v2-audit.json
```

This script reports review candidates, not defects. Its output must be reviewed by role before removing colors. Financial/status/third-party colors may be valid exceptions.
