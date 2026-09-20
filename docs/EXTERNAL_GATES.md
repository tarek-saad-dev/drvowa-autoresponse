# DRVOWA External Gates

Items that **cannot** be completed by inventing credentials, legal text, or business decisions.

| ID | Gate | Status | Notes |
|----|------|--------|-------|
| EXTERNAL_GATE_PAYMENT_PROVIDER | Stripe/Paymob/etc. selection + merchant credentials | OPEN | Build provider boundary only; FREE/BETA mode OK |
| EXTERNAL_GATE_PRICING | Final plan prices / packaging | OPEN | Do not invent prices on landing |
| EXTERNAL_GATE_EMAIL_PROVIDER | Transactional email for password reset | OPEN | Implement token lifecycle + adapter; production send gated |
| EXTERNAL_GATE_LEGAL_REVIEW | Lawyer-approved privacy/terms | OPEN | Ship scaffold pages with configurable company placeholders |
| EXTERNAL_GATE_ERROR_MONITORING | Sentry/etc. DSN | OPEN | Structured logs without vendor |
| EXTERNAL_GATE_DNS_DOMAIN | Production domain / TLS ownership | OPEN | Ops only |
| EXTERNAL_GATE_PRODUCTION_SECRETS | Prod DB/runtime/Gemini secrets | OPEN | Never invent; never deploy from this agent |

Engineering work continues around these gates.
