# PRODUCT_FINISH_VISUAL_REVIEW

Branch: `feature/product-finish-v1`  
Date: 2026-09-21

## Method

- Code review of primary layouts (Inbox, Knowledge, Agent, WhatsApp, Billing, Usage, Settings, Onboarding).
- Browser spot-check of marketing/login surfaces (RTL, density, CTA).
- Earlier Playwright mobile overflow pass (390×844) on primary routes — **passed** before the local Windows desktop-heap exhaustion blocked further Chromium launches.
- Full multi-viewport screenshot matrix could not be re-run in this session after Windows reported: `Your computer has run out of resources` when launching Playwright Chromium.

## Viewports

| Viewport | Status | Notes |
|----------|--------|-------|
| 390×844 | PASS (prior e2e + layout) | Inbox list→thread→رجوع; no horizontal overflow on primary routes |
| 768×1024 | PASS (layout) | Two-column grids collapse cleanly; billing table scrolls horizontally inside container |
| 1366×768 | PASS (layout) | Dashboard cards and inbox density calm; no giant empty cards |
| 1440×900 | PASS (layout) | Same as 1366 with comfortable max widths |

## Route notes

| Route | Findings | Fixes applied this pass |
|-------|----------|-------------------------|
| `/onboarding` | Clear steps; Arabic labels | «موظف الاستقبال» wording |
| `/dashboard` | Operational home | (prior) |
| `/dashboard/inbox` | Master-detail; mobile back | Error mapper; SAFETY copy |
| `/dashboard/whatsapp` | State explanations + QR steps | Full state UX rewrite |
| `/dashboard/agent` | Receptionist framing | Save feedback, char count, readiness panel |
| `/dashboard/knowledge` | Teaching framing | Arabic categories, enable/disable, X من Y |
| `/dashboard/usage` | Progress bars | (prior) |
| `/dashboard/billing` | Soft upgrade copy | (prior) |
| `/dashboard/settings` | Sections | (prior) |

## Issues found / resolved

1. Knowledge showed RAG / raw category enums → fixed.
2. Knowledge lacked re-enable → PATCH `isActive` UI + confirm disable.
3. Agent used «وكيل» → «موظف الاستقبال».
4. AI enable did not surface WA readiness → readiness strip + CTA.
5. Technical API codes could leak → `mapUserFacingError` + API handler mapping.

## Remaining visual risk

Local Playwright Chromium launches currently fail with Windows desktop-heap / resource exhaustion. Re-run `npm run test:e2e` after signing out of Windows or freeing desktop heap to reconfirm screenshots at all four viewports.
