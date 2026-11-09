# DRVO AutoRespond — Brand V2 Migration Plan

> Status: **Phase 00 — baseline and preparation** (2026-11-10).  
> Integration branch: `feat/brand-v2` (created from `main` at `f60a61cec837b2847b1629fa38cc69221e4667fb`).  
> Tracking: [Issue #119](https://github.com/tarek-saad-dev/drvowa-autoresponse/issues/119).  
> Public product name: **DRVO AutoRespond**; public URL: **https://drvoautorespond.com/**.

## Source of truth / approval boundaries

The team visual guidelines v1.0 describe the approved **Bold Editorial, Direction C** typography and visual character. The design palette from that reference is:

| Role | Hex | Usage |
| --- | --- | --- |
| DRVO Ink | `#0B0F14` | dark page background, high-emphasis surfaces |
| Carbon | `#151B23` | dark cards / secondary surfaces |
| Soft White | `#F7F9FC` | light canvas and dark-mode text |
| Mist Gray | `#DCE3EA` | light dividers, supporting surfaces |
| Signal Green | `#7BF36A` | dark-surface primary highlights only |
| Deep Green | `#1F9D55` | core brand support |

Semantic functional colors from reference: **Blue `#4EA7FF`**, **Red `#FF5C5C`**, **Amber `#F6B73C`**.

**Important exceptions / blockers:**
- The approved Editorial lettering is an **image reference, not a production font**. Do not present an arbitrary font as the final brand typeface. Keep readable UI body typography until licensed font/vector assets are approved; record proposed display fallbacks separately.
- The reference PDF uses the old name **AutoResponse**. User-visible text and media exported for production must say **AutoRespond**. Do **not** blindly replace the internal repo, package, service, database, environment variables, URLs, or API identifiers containing `autoresponse`.
- The PDF marks the final vector logo and licensed type assets as **pending / verify**. Existing `public/brand/logo-on-light.png` and `logo-on-dark.png` must stay intact until approved replacements are supplied.
- Light-mode interactive green needs accessible dark variants; proposed `#188342` is a **derived UI tone**, not a seventh core brand color. Contrast must be verified before use.
- WhatsApp message states, blue info, red errors, amber warning, InstaPay purple, and any meaningful category/identity colors should remain distinguishable.
- Brand change is **visual only**. Do not alter billing, session, API, tenant, inbound/outbound, escalation, WhatsApp, refund, or campaign functionality.

## Architecture / baseline observed on main

Runtime: Next.js 16, React 19, Tailwind CSS 4, TypeScript, Vitest, Playwright. Production deploy workflow runs when changes are pushed to `main`.

| Area | Current source | Baseline finding | Migration ownership |
| --- | --- | --- | --- |
| Root design tokens | `src/app/globals.css` | Teal `#00759a`, dark `#0b8bb5`, mixed semantic colors | P01 |
| Font setup / metadata | `src/app/layout.tsx` | IBM Plex Sans Arabic and Space Grotesk; browser theme is Teal | P01 |
| Logo | `src/components/brand/brand-logo.tsx`, `public/brand/*` | light/dark image variants | P01 (assets only on approval) |
| Shared elements | `src/components/ui/*` | button/input/card/alert/badge + other components | P02 |
| Landing | `src/components/landing/marketing-page.tsx`, `landing.module.css` | 1,974 CSS lines, 242 hex occurrences, independent palette | P03 |
| Animated diagrams | `src/components/landing/conversation-flow.tsx` | Canvas colors read old `--brand-teal`, fixed hex gradient | P03 |
| Pricing / promo | `src/components/landing/pricing-cards.tsx`, `src/app/promo/[code]/*` | separate promo CSS, old visible brand name | P03 |
| Auth / choose-plan | `src/app/(auth)/*`, `src/app/(app)/choose-plan/*` | shared and local components | P04 |
| Onboarding | `src/components/onboarding/onboarding-theme.css`, `guided-preview.tsx` | Cyan neon and Thmanyah import | P04 |
| Navigation | `src/components/dashboard/sidebar.tsx`, `topbar.tsx`, `mobile-nav.tsx` | hardcoded Teal effects; some Unicode icons | P05 |
| Home / Pulse | `src/components/dashboard/overview/*`, `pulse/*` | bespoke dashboard states | P05 |
| Inbox | `src/components/dashboard/inbox-panel.tsx` | custom color variants, old visible name, Teal grid | P06 |
| AI / campaigns | `src/components/dashboard/employee-studio.tsx`, `label-campaign-* .tsx` | separate chat and campaign flows | P07 |
| Billing/admin | `src/app/(app)/dashboard/billing/*`, `src/components/admin/*` | mixed UI variants; InstaPay branding in payment UI | P08 |
| QA and release | `e2e/*`, `.github/workflows/*` | tests exist; screenshot assertions incomplete | P09 |

## Phase execution table

| Phase | Goal | Deliverable and gate |
| --- | --- | --- |
| **00** | Baseline, documented scope, audit script, master issue, isolated branch | Branch + auditable inventory; no code behavior changes |
| **01** | Central CSS semantic tokens, theme maps, fonts/metadata, logo readiness | Light/dark token proof + contrast; no stale Teal browser theme |
| **02** | Shared controls, icons, loading and interaction states | Reusable components meet keyboard, focus, RTL and responsive checks |
| **03** | Landing, marketing motion, pricing and promo | All old Blue/Cyan decoration removed without broken pricing/CTA links |
| **04** | Signup/login/reset, choose-plan and WhatsApp onboarding | Existing auth/onboarding flows still pass |
| **05** | App shell, navigation, home, Pulse and settings | No unread/handover/ownership flow regression |
| **06** | Inbox and real-time message surfaces | Desktop/mobile thread, scroll, messages, ownership all preserved |
| **07** | Agent studio, knowledge, labels and campaigns | Compose, preview, guard, send state visually consistent |
| **08** | Billing, payment methods, refunds, admin | Financial data, action affordances and external brand colors preserved |
| **09** | Visual / accessibility / E2E / release readiness | Review approved before merging integration to main; rollback verified |

## Implementation order and PR rules

1. **Never work directly on main** for this migration; `feat/brand-v2` is the integration target.
2. Phase branches: `feat/brand-v2-p01-foundation`, `feat/brand-v2-p02-components`, etc., branched from up-to-date integration; PR each into integration.
3. One logical phase per PR; no incidental behavior changes, and record affected routes/components.
4. `main` deploys to VPS; integration-to-main should remain a draft PR until QA sign-off.
5. Existing `feat/brand-theme-light-dark` branch diverges from current main; treat as history/reference only, not a merge base.
6. Keep `docs/brand-v2/BASELINE.md` and Issue #119 updated at each phase.
7. Any issue blocking a sprint is `BLOCKED`, not `DONE`.

## Mandatory validation matrix

- Desktop/mobile breakpoints: 360, 390, 768, 1280, 1440px.
- Light/dark mode, initial theme flash, Arabic RTL, English LTR, mixed number/currency rendering.
- Default, hover, active, focus-visible, disabled, busy, success, warning, info, error and empty states.
- Text contrast WCAG 2.2 AA; preserve icon/label as companion to status color.
- `npm run typecheck`, `npm run build`, `npm test`, and relevant Playwright E2E.
- Screenshot diff targets: public hero, pricing, login, plan-selection, onboarding, home, Pulse, inbox list/thread, agent, campaigns, billing/payments/refunds, admin.
- Manual smoke: login/logout, onboarding, select plan, inbox send/receive, handover, WhatsApp connection, campaign compose, checkout/refund.
- Preserve performance (no new blocking heavy fonts or unnecessary full-screen loading).

## Acceptance criteria

A phase is **DONE** only after merged into integration with passing checks and a before/after visual review. The complete project is **DONE** only when all phase PRs pass, old public brand text is gone, no unexplained legacy decorative Teal/Cyan remains, images/metadata are updated, and the reviewed integration branch is safely promoted to `main`.

## Phase 00 outputs

- [x] Confirmed repository and current `main`.
- [x] Verified brand PDF rules and asset-production caveats.
- [x] Created integration branch `feat/brand-v2`.
- [x] Opened Issue #119 as master tracker.
- [x] Saved this migration plan.
- [ ] Capture browser screenshots from running application (requires reachable authenticated preview). Deferred to Phase 01 before broad visual changes.
- [ ] Confirm final approved vector wordmark and commercial font files when available (not a prerequisite to tokenizing the theme).

## Next action

**P01 — Foundation**: implement scoped semantic light/dark tokens and theme mappings (no DB/API changes), add an internal token preview or test, update browser theme metadata, check contrast, then review as a PR into `feat/brand-v2`.
