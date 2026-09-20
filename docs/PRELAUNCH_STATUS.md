# DRVOWA Prelaunch Status

**Updated:** 2026-09-21  
**Branch:** `release/prelaunch-v1`  
**SHA:** `b4fbd449a75518e03d23d8f8d4e2efc1ab704e41`  
**Main (untouched):** `4b1a7b598f14a65d78283d85ba954dfec27d86fd`

## Completed phases

### Phase 0 — Billing safety (DONE)
### Phase 1 — Audit + master docs (DONE)

### Phase 2 — Auth & account security (MOSTLY DONE)
- httpOnly session cookie, SameSite=lax, Secure in production, 14d TTL, revoke on logout
- Login/signup/password-reset rate limits
- Generic login + signup duplicate messaging (anti-enumeration)
- Password reset: migration 012, hashed tokens, email provider adapter (local + gated prod)
- Security headers via `next.config.ts` (CSP, frame deny, nosniff, referrer)
- `/forgot-password`, `/reset-password` UI

### Phase 6 — Inbox manual reply (DONE engineering)
- `sendManualInboxReply` — server-side accountKey, quota, idempotency, HUMAN_TAKEOVER
- Inbox UI composer + ambiguous-result warning
- Unit tests for manual reply + auth security

### Phase 8 partial — Payment provider boundary (DONE scaffold)
- `PaymentProvider` interface + unconfigured adapter (EXTERNAL_GATE)

### Phase 11 partial — Landing copy refresh (DONE for stale WA/inbox claims)
### Phase 16 partial — Ops runbooks (DONE)
### Phase 19 — Legal scaffolds `/privacy` `/terms` (DONE; EXTERNAL_GATE_LEGAL_REVIEW)

## Active phase

Continue Phase 3 (tenant isolation expansion), 4–5 polish, 7–10 UX, 13–15, 17–18, 21 E2E, then Phase 23 RC.

## Next task

1. Run unit tests + typecheck/lint/build
2. Apply migration 012 locally
3. Expand tenant isolation / E2E release suite
4. Dependency audit
5. Final RC when engineering complete

## Test baseline

- New unit: `auth-security`, `manual-reply-service`
- Full suite: run after checkpoint

## Migrations

- Latest: `012_password_reset_tokens.sql`
- **Not** applied to production

## External gates

See `docs/EXTERNAL_GATES.md` (+ email provider for prod reset delivery).

## Resume instructions

Continue DRVOWA autonomous prelaunch execution.  
Read `docs/PRELAUNCH_MASTER_PLAN.md` and this file first.  
Do not ask for approval between phases. Work only on `release/prelaunch-v1`.
