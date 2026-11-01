# Pricing V1 usage wallet (not live)

Migration 090 adds tenant-isolated wallets, immutable consumption events and an atomic/idempotent SQL reply consumption procedure. It does NOT insert any wallet, backfill a tenant, grant credits, alter invoices or activate the new prices. SQL migration must be tested against an isolated SQL Server database before merging.

Integration still required:
- A grant service with verified payment or verified initial trial entitlement, subscription-cycle keys and expiry semantics.
- Reply settlement tied to successfully sent outbound replies and reliable retries (reserve/settle or compensated consumption).
- Enforced tenant-scoped knowledge, seats and voice minute quotas.
- Durable per-credit-lot top-up expiry (current wallet is an aggregate foundation only).
- Integration tests exercising concurrent consumes and duplicate keys in SQL Server.
- UI/API, admin controls, subscriptions, migrations and cost verification.

Important: do not invoke PricingV1ConsumeReply until provisioning and settlement are complete. The wallet starts at zero for new tenants; legacy tenants are unchanged.
