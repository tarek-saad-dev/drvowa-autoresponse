# Observability (vendor-free)

Structured logs use `structuredLog(scope, event, fields)` from
`src/lib/observability/logger.ts`. Sensitive keys are stripped
(`password`, `token`, `authorization`, `cookie`, `phone`, `apikey`, `secret`, …).

Vendor error monitoring (Sentry/etc.) remains **EXTERNAL_GATE_ERROR_MONITORING**.

## Stable event names

| Event | Scope | Meaning |
|-------|-------|---------|
| `billing.checkout.gated` | billing | Checkout refused — payment provider unconfigured |
| `billing.portal.gated` | billing | Portal refused — payment provider unconfigured |
| `billing.webhook.rejected` | billing | Signature / verification failed |
| `billing.webhook.duplicate` | billing | Idempotent replay of a known provider event |
| `billing.webhook.applied` | billing | Subscription updated from verified webhook |
| `billing.webhook.ignored` | billing | Verified but no matching subscription |
| `email.send.local` | email | Local adapter queued (no external delivery) |
| `auth.password_reset.requested` | auth | Reset flow started (no raw token) |

Prefer adding new events to this table when introducing call sites.
