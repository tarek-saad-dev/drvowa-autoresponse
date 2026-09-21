# Payment provider requirements (owner decision)

**Gate:** `EXTERNAL_GATE_PAYMENT_PROVIDER` + `EXTERNAL_GATE_PRICING`

Engineering ships a provider-agnostic boundary (`payment-provider.ts`,
checkout/portal/webhook routes, subscription lifecycle). The **owner** selects
and contracts a merchant provider. Do not invent prices or credentials in-repo.

## Must-have capabilities (Egypt commercial launch)

| Capability | Why |
|------------|-----|
| Egypt card acceptance | Local customer cards (Visa/Mastercard) and settlement path |
| Recurring subscriptions | Monthly plan renewals without manual re-checkout |
| Webhooks | Reliable `invoice.paid` / past_due / cancel / expire signals |
| Hosted checkout | Redirect or embedded checkout URL returned to the SaaS |
| Customer portal | Update card / cancel / invoices without custom PCI UI |
| Refunds | Partial/full refund for support and chargebacks |
| Settlement / payouts | Clear EGP (or agreed currency) settlement to business bank |
| Merchant onboarding | KYC, tax docs, and production keys under owner control |

## Candidate families (examples only)

- Global: Stripe (if Egypt entity / supported rails fit the business)
- Regional: Paymob and similar Egypt PSPs with recurring + webhooks

Selection criteria belong to the owner (fees, settlement speed, 3DS, dispute
tools, Arabic receipts). Engineering will add an adapter named after the chosen
provider behind `PAYMENT_PROVIDER=` once credentials exist.

## Engineering contract (already in code)

- `isPaymentCheckoutEnabled()` stays **false** until provider + credentials
- Checkout/portal APIs return `503` `{ code: EXTERNAL_GATE_PAYMENT_PROVIDER }`
- Webhooks verify signature then `applyVerifiedWebhook` (idempotent)
- UI must not show a fake Buy button while gated
