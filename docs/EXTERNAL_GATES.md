# DRVOWA External Gates

Items that **cannot** be completed by inventing credentials, legal text, or business decisions.

| ID | Gate | Status | Notes |
|----|------|--------|-------|
| EXTERNAL_GATE_PAYMENT_PROVIDER | Stripe/Paymob/etc. selection + merchant credentials | OPEN | Boundary + lifecycle ready; checkout returns 503 until configured. See `docs/PAYMENT_PROVIDER_REQUIREMENTS.md` |
| EXTERNAL_GATE_PRICING | Final plan prices / packaging | OPEN | Plan **limits** seeded (STARTER/PRO/BUSINESS); no prices in UI |
| EXTERNAL_GATE_EMAIL_PROVIDER | Transactional email for password reset | OPEN | Resend + SMTP adapters exist; delivery only with credentials |
| EXTERNAL_GATE_LEGAL_REVIEW | Lawyer-approved privacy/terms | OPEN | Scaffold pages + `docs/LEGAL_REVIEW_CHECKLIST.md` |
| EXTERNAL_GATE_ERROR_MONITORING | Sentry/etc. DSN | OPEN | `structuredLog` without vendor — `docs/OBSERVABILITY.md` |
| EXTERNAL_GATE_DNS_DOMAIN | Production domain / TLS ownership | OPEN | Ops only — not in this prep |
| EXTERNAL_GATE_PRODUCTION_SECRETS | Prod DB/runtime/Gemini secrets | OPEN | Never invent; never deploy from this agent |

Engineering work continues around these gates. Host port guidance:
`docs/HOST_SECURITY_PORT_AUDIT.md` (do not apply firewall without sudo).
