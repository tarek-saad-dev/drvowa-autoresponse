# DRVOWA Prelaunch Report

**DRVOWA_PRELAUNCH: READY (ENGINEERING)**  
**DRVOWA_FINAL_RELEASE_GATE: PASS** (FREE/BETA mode)

Paid commercial launch is **not** claimed while payment/pricing gates remain open.

---

## Git (non-self-referential)

| Item | Value |
|------|--------|
| Branch | `release/prelaunch-v1` |
| Release code SHA | Commit titled `chore: finalize v1 release gate` (includes gate tooling + onboarding hydrate fix). Confirm with `git log -1 --grep="finalize v1 release gate" --format=%H` |
| Branch tip | Always `git rev-parse origin/release/prelaunch-v1` — **do not** treat an in-doc SHA as tip after later commits |
| Main (untouched) | `4b1a7b598f14a65d78283d85ba954dfec27d86fd` |

## Product

| Area | Status |
|------|--------|
| Auth | PASS |
| Password reset | PASS (email send gated) |
| Onboarding | PASS |
| WhatsApp UX | PASS |
| Inbox + manual reply | PASS |
| AI + quotas + takeover | PASS |
| Knowledge + Agent limits | PASS |
| Billing/usage FREE | PASS |
| Landing/dashboard copy | PASS |
| Legal scaffolds | PASS (EXTERNAL_GATE_LEGAL_REVIEW) |

## Security

| Area | Status |
|------|--------|
| Tenancy | PASS |
| Rate limits | PASS |
| Session cookies | PASS (Secure in production NODE_ENV) |
| Runtime inbound bearer auth | PASS |
| Security headers / CSP | PASS |
| Prod `npm audit --omit=dev` | PASS — 0 vulnerabilities |

## Database

| Item | Status |
|------|--------|
| Latest migration | `012_password_reset_tokens.sql` |
| Live upgrade 001→012 | PASS (timestamps 009→012 ordered) |
| 011 preserve counters | PASS (SQL + idempotent re-run) |
| Clean empty DB create | **BLOCKED_BY_ENVIRONMENT** — DB user lacks `dbcreator` / CREATE DATABASE. File order + upgrade evidence substitute used. |

## Tests / build (fresh gate)

| Check | Status |
|-------|--------|
| `npm test` | PASS — 211/211 |
| Flake recheck (loop-guard, crash-recovery, billing) | PASS — 29/29 |
| typecheck / lint / build | PASS |
| Playwright smoke A–H | PASS — 4/4 |
| Prod audit | PASS — 0 |

## External gates (OPEN)

See `docs/EXTERNAL_GATES.md`.

## Do not

- Merge to `main` until owner gate
- Deploy / SSH / touch production WhatsApp from this agent
