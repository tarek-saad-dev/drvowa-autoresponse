# DRVO AutoRespond — Phase 05: Dashboard, Navigation, Pulse

## Scope implemented
- **App chrome**: coherent neutral Ink/Green visual system; unified SVG account/logout icons in topbar; preserved visible mobile logout and existing settings link.
- **Sidebar**: refined selected/hover/focus states, accessible current-page markers, minimum interactive height, brighter circular account avatar with user initial + plan label.
- **Dashboard Home**: calmer max-width and spacing; semantic shadows instead of fixed legacy Teal/RGB; clear AI colleague panel CTA.
- **Pulse overview**: equalized metrics with fewer visual layers; the only special emphasis is on **actionable followups when count >0**, not on every metric; today/yesterday/month tabs have consistent keyboard focus and preserve month as default.
- **Live ownership & review center**: retained existing manual-followup and team ownership APIs, query filters, review counts and review actions. Harmonized semantic warning and shadow tokens.
- **Pulse summary chat**: remains a bottom support-chat launcher with data-backed summary; only its shadow / typography were updated. No reintroduction of verbose summary cards above the fold.
- **Reply popup**: preserved send, error, subscription-quota and confirm-resolution behavior; improved input focus border and button contrast.

## Functional boundaries
This PR does **not** change `getPulseSnapshot`, `getHumanOwnershipSnapshot`, billing alert logic, WhatsApp inbox ownership, post-payment quota logic, APIs, query parameters, or session behavior.

The Home period defaults to `month`, with `today` and `yesterday` retained. The pending count is `needsAttentionFollowups+pendingSignals`, and the UI doesn't invent zero values when Pulse data is unavailable.

The bottom nav stays hidden inside an open inbox thread so the composer is not obstructed.

## QA
- `tests/unit/brand-v2-dashboard-pulse.test.tsx` verifies role focus, source contract, period links, metrics, semantic attention emphasis, account/logout and live ownership.
- Existing module/integration suite must pass Typecheck + Next build + full tests in GitHub CI before merging to `feat/brand-v2`.
- Browser-level QA is still required before Production: RTL, light/dark, 360/390/768/1280/1440, full Home after payment, inbox human-owned cases, notifications, chat-popup focus, reply/resolve and screen-reader checks.
- Final licensed display font and official vector mark are not changed in this PR.

## Release safety
No direct merge to `main`. Integration-to-main PR #121 must stay draft until all phases and full visual E2E checks pass. Phase tracker: #130, master: #119.
