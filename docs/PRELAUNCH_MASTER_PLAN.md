# DRVOWA Prelaunch Master Plan

Product: DRVOWA AutoResponse / DRVO AI Receptionist  
Release branch: `release/prelaunch-v1`  
Baseline: commercial billing foundation (migrations 010–011) complete.

## Goal

Ship a production-quality **PRE-LAUNCH RELEASE CANDIDATE** for V1 WhatsApp AI receptionist SaaS.

`PRELAUNCH_READY = YES` when engineering is complete and only external/human gates remain.

## Phase map

| Phase | Name | Depends on | Status |
|-------|------|------------|--------|
| 0 | Billing crash window + counter backfill | — | DONE |
| 1 | Full system audit + docs | 0 | DONE (this doc) |
| 2 | Auth & account security | 1 | DONE (email send gated) |
| 3 | Tenant isolation audit/tests | 2 | NEXT |
| 4 | Onboarding polish | 2 | PENDING |
| 5 | WhatsApp connection UX | 4 | PENDING |
| 6 | Inbox + human manual reply | 2,5 | DONE |
| 7 | AI receptionist productization | 6 | PENDING |
| 8 | Billing/usage UX polish | 0 | PARTIAL (provider boundary) |
| 9 | Settings / account UX | 2 | PENDING |
| 10 | Dashboard accuracy | 6,8 | PARTIAL |
| 11 | Public landing rewrite | 6,10 | PARTIAL |
| 12 | Responsive UI / a11y | 11 | PENDING |
| 13 | API / performance | 6 | PENDING |
| 14 | Rate limits / abuse | 2 | DONE |
| 15 | Logging / privacy | 2 | PARTIAL |
| 16 | Health / ops runbooks | 1 | DONE |
| 17 | Migration hardening docs | 0 | DONE |
| 18 | Dependency / security audit | 1 | PENDING |
| 19 | Legal pages | EXTERNAL_GATE_LEGAL | SCAFFOLD DONE |
| 20 | Error observability hooks | EXTERNAL_GATE_MONITORING | PARTIAL (structured api logs) |
| 21 | E2E release tests | 6+ | PENDING |
| 22 | Placeholder / copy audit | 11 | PENDING |
| 23 | Final RC verification | all | PENDING |

## Launch blockers (engineering)

1. ~~Human manual inbox reply~~ DONE
2. ~~Stale Phase-1 product copy (major)~~ largely DONE — re-audit Phase 22
3. ~~Auth hardening / rate limits / password-reset lifecycle~~ DONE (email gated)
4. Tenant isolation proof suite expansion + API-level cross-tenant tests
5. ~~Legal page scaffolds~~ DONE — lawyer review gated
6. ~~Ops runbooks~~ DONE
7. E2E release suite (Phase 21)
8. Dependency audit + final RC verification

## Safe to defer (post-V1 / external)

- Contacts directory UI
- ERP integrations live calls
- Payment provider checkout (EXTERNAL_GATE_PAYMENT_PROVIDER + PRICING)
- RAG / vector rewrite
- Instagram / Messenger / Telegram
- Campaigns / CRM builder
- Native mobile apps

## External gates (do not invent)

See `docs/EXTERNAL_GATES.md`.

## Working rules

- All work on `release/prelaunch-v1` only; never push `main` during autonomous work.
- Small checkpoint commits; update `docs/PRELAUNCH_STATUS.md` after each.
- No fake TODOs for launch-critical paths.
- Prefer truthful beta/FREE mode over invented payments/pricing.
