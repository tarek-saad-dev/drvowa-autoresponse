# DRVO AutoRespond — Phase 06: Inbox Brand V2

**Branch:** `feat/brand-v2-p06-inbox` → integration `feat/brand-v2`  
**Tracker:** #132 (master #119)

## Scope implemented

- **Conversation list:** editorial hierarchy, semantic search input/border/focus, scrolling filters, consistent unread-dot, neutral brand-derived avatars, accessible pin icon, RTL logical selected border, reduced-motion loading indicators.
- **Ownership and follow-up:** meaningful text status label for exceptions to normal AI operation (team-owned, open escalation, failed/disabled/replying AI); status dot is only supplementary. No artificial unread *count* presented when the database only exposes a boolean.
- **Color roles:** semantic `info`, `success`, `warning` and `destructive` for AI/team/attention/safety states. Keep communication `--whatsapp-bubble` and `--whatsapp-bubble-text` separate from marketing green `--primary`.
- **Thread surface:** removed remaining hardcoded Teal dot background, uses a subtle semantic foreground pattern; inbound card and outgoing bubble use accessible shared surface tokens.
- **Quoted messages & media:** RTL logical quote border, transparent semantic subtles, mobile `max-w-full` for image/audio/video, visible focus on file links.
- **Composer and actions:** input border/ring, send disabled foreground, keyboard focus for header/back/info, actions and metadata controls; existing safe-area padding and mobile thread/full-height shell preserved.
- **Public naming:** visible `DRVO AutoResponse` on mobile inbox logo link corrected to **DRVO AutoRespond**. No internal identifier, DB, worker, API or git repo names changed.

## State distinctions (not color-only)

| Conversation condition | Semantic role | Meaning |
| --- | --- | --- |
| AI active, no attention needed | success / subtle | AI currently owns chat |
| AI processing reply | info | Preparing; not sent yet |
| Team is responsible | info + visible “مع الفريق” | Human ownership, no new reply pending |
| Customer awaiting team | warning + visible “ينتظر رد الفريق” | Action needed |
| Open follow-up in progress | info + visible “جاري التعامل” | Handling, not a new follow-up |
| Follow-up needs attention | warning + visible “تحتاج متابعة” | Action needed |
| Safety paused / send failed | destructive + text | Intervention needed |

## Business logic held fixed

- No changes to `ConversationRow` / `MessageRow` schemas, cursor pagination, polling, canonical UUID deep links, filter/search query handling, saved messages or ownership notifications.
- No changes to `sendManual`, `resumeAi`, `resumeAllAi`, `escalateConversation`, `updateEscalation`, metadata toggles, WhatsApp connection gating, AI job truthfulness or quota checks.
- No changes to `/api/inbox/media/`, `/api/inbox/conversations/`, membership checks and tenant-scoped state.
- No premature AI auto-return after human takeover and no false “sent” status.
- Mobile thread continues to inform `InboxChromeProvider` to hide bottom navigation when composer is active.

## Regression gates

- `tests/unit/brand-v2-inbox.test.tsx` (new) + existing `inbox-layout-contract.test.tsx`, `inbox-deep-link.test.tsx`, `inbox-page-deeplink.test.tsx`, `inbox-pagination.test.ts`.
- PR CI: Typecheck, Next Production Build and full test suite; static Brand V2 color/name inventory.
- Production release *still blocked* on authenticated live-browser review: RTL/light/dark, 360/390/768/1280/1440 widths, unread/search/filter/archived/pinned/media and actual inbound/outbound/quote/escalation transitions. Code/SSR contracts alone do not establish visual correctness.
- Maintain approved official logo imagery until vector and licensed editorial font assets are provided.

**Release safety:** PR targets `feat/brand-v2` only. Keep final integration-to-`main` PR #121 Draft until all phases, visual QA, and final approval.
