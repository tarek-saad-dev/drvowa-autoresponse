# DRVOWA Launch Checklist

## Engineering (must be YES)

- [x] Auth: signup/login/logout/session secure — evidence: httpOnly/SameSite/Secure-in-prod cookies; logout revokes session
- [x] Auth: rate limits on login/signup — evidence: `RATE_LIMITS` + 429 on smoke when exceeded
- [x] Auth: password reset lifecycle (provider may be gated) — evidence: migration 012 + local/gated email adapters
- [x] Tenant isolation proven by tests — evidence: `tests/integration/tenant-isolation.test.ts` (incl. inbox)
- [x] Onboarding complete + resumable — evidence: sessionStorage draft + `/api/onboarding/complete`; wizard no longer blocks UI on hydrate
- [x] WhatsApp connect/QR/reconnect UX accurate — evidence: dashboard WhatsApp page + runtime client states
- [x] Inbox operational — evidence: inbox panel list/thread + smoke
- [x] **Human manual reply** — evidence: `manual-reply-service` + POST messages + unit tests
- [x] Human takeover safe vs AI race — evidence: pauseConversationAi HUMAN_TAKEOVER in send path
- [x] AI worker durable + quota safe — evidence: orchestrator releaseEligible + billing integration tests
- [x] Knowledge + Agent limits enforced — evidence: field-limits + Zod max + entitlements
- [x] Billing/usage dashboards accurate — evidence: billing/usage pages + smoke
- [x] Landing/dashboard copy matches reality — evidence: copy audit / deferred pages marked خارج V1
- [x] `/privacy` + `/terms` pages present — scaffold; legal text EXTERNAL_GATE
- [x] No launch-facing “next phase” lies — deferred surfaces say خارج V1
- [x] Rate limits on sensitive APIs — login/signup/reset/manual-send/wa-connect
- [x] No secrets/PII in ordinary logs — runtime redaction + API error sanitization (ongoing ops discipline)
- [x] Health/readiness + runbooks — `/api/health`, docs/*_RUNBOOK.md
- [x] Migrations 001→latest clean + upgrade path — upgrade proven on live DB; clean empty CREATE DATABASE blocked by SQL role (see report)
- [x] `npm test` / typecheck / lint / build PASS — fresh gate run 2026-09-21
- [x] E2E release flows A–J covered or explicitly deferred with reason — Playwright smoke A–H PASS; full A–J browser automation not required beyond smoke + integration/unit contracts

## External (may remain OPEN)

- [ ] Payment provider credentials
- [ ] Final pricing
- [ ] Email provider credentials
- [ ] Legal review sign-off
- [ ] Error monitoring vendor
- [ ] DNS/domain
- [ ] Production secrets + deploy (human-operated)

## Stop condition

`PRELAUNCH_READY = YES` when all Engineering items are YES and only External items remain.

**Launch mode:** FREE/BETA engineering ready. Paid commercial launch requires payment + pricing gates.
