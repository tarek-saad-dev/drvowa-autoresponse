# Add-on payment staging

Migration 095 extends draft add-on orders with separate payment identifiers and submission / review metadata. Internal service creates an idempotent tenant-locked DRAFT order with server-side prices and current paid-plan eligibility. Disabled in production regardless of environment flags. Does not create a subscription payment intent, change a plan, transfer money or grant any credit.

Next: authenticated API for submission with evidence, admin pending queue, verified approval, atomic idempotent entitlement grant with expiration, then SQL integration tests. Do not treat DRAFT as paid or enable customer-facing CTAs.
