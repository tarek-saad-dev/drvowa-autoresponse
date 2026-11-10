# DRVO AutoRespond — Brand V2 Phase 07: Agent, Knowledge & Campaigns

Part of Issue #134 / master #119. This is a **visual/accessibility migration** on the integration branch, not a feature release or a change to WhatsApp sending permissions.

## Scope executed

| Surface | Design improvement | Unchanged behavioral contract |
| --- | --- | --- |
| AI employee workspace | Consistent editorial heading, reduced animation, legible status and active-agent focus | WhatsApp readiness, enable/disable, takeover policy choices and save calls |
| Agent personas | Calmer preset chips, visible keyboard focus and coherent weights | Character creation, persona settings, validation and permissions |
| Knowledge overview | Cohesive 2xl surfaces, calmer category chips, accessible AI/manual selection | Knowledge count, limit, categories and chosen mode |
| Employee training chat | Better mobile width, reduced-motion thinking dots, accessible mic focus | Voice transcription, message input, proposal approval, conflicts and save gating |
| AI knowledge copilot | Standard card radii, semantic shadow, focusable quick starts and proposal expansion | Analyze/extract, conflict choices, explicit selected-only approval |
| WhatsApp connection | Reusable typography and status visuals, responsive white QR display, safe loading | Connection/QR/runtime/inbound health truthfulness and disconnect controls |
| Campaign flow | Lower contrast clutter, focusable list/search/edit and compact steps, consistent composer borders | Draft/approve/review states and source list selection |
| Campaign lists | Distinguishable destructive removals, focusable list management and input affordances | Add/import/remove/test APIs and archived/list membership logic |
| Campaign audience/preflight | Readable status and warning surfaces; partial audience is explicitly disclosed | Read-only audience snapshot; explicit server feature gate and no automatic sending |
| Campaign launch | Semantic QUEUED/RUNNING/PAUSED/COMPLETED status, warning for UNKNOWN, clear final confirmation, disabled start if not eligible | **Server `canLaunch`, opt-in and STOP gates, eligibility/quota, rate/backoff, owner confirmation, exact copy and POST/PATCH APIs** |

## Critical safety invariants

1. **No new or broader campaign sending permission.** Server `sendingEnabled` and `canLaunch` behavior is unchanged; the tool must not imply that campaigns were actually sent.
2. No bypass of marketing consent, opt-outs, dedupe, rate limits, recipient checks, quota or actual WhatsApp send status.
3. Saved knowledge is only applied after explicit review/selection. Conflicts block approval until the user makes a choice.
4. AI ownership/human handover state transitions, scheduling and bot settings are unchanged.
5. Public brand name is **DRVO AutoRespond**. Internal identifiers can retain historic `autoresponse` names.
6. Light/dark colors are semantic (primary, warning, destructive, info, success). No manual Teal/Cyan in edited surfaces. Buttons have visible keyboard focus and reduced-motion handling.

## Automated and manual verification

- Added `tests/unit/brand-v2-agent-campaigns.test.ts` to verify 10 independent view/state/gate contracts, in addition to existing campaign/knowledge tests.
- Before merge: PR CI must pass Typecheck, Next production build and full unit suite.
- **Before Production release:** browser visuals and keyboard/mouse/RTL at 360/390/768/1280/1440; real owned test workspace for agent training/knowledge approval; server-gated campaign preview/test/launch including false/failed/unknown/scheduled states.
- No official vector mark or licensed display font was introduced; existing approved artwork remains pending final source approval.

## Branch policy

Open PR from `feat/brand-v2-p07-agent-campaigns` into `feat/brand-v2`. Do **not** merge into production `main`; end-to-end and browser signoff are final Phase 09 gates. Draft release PR #121 remains open.
