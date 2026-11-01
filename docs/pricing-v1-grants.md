## Grant and refund foundations (draft, not active)
Migration 091 introduces atomic/idempotent GRANT and failed-delivery REVERSAL procedures. Internal TypeScript helpers do **not** verify payments themselves; only an authoritative billing worker should call grantVerifiedReplies after payment verification and entitlement period validation.

**Not yet done:** accurate send lifecycle integration, reserve/settle protection against two simultaneous pending sends with one remaining credit, payment binding, credit-lot expiry, SQL Server concurrency tests, production activation. Avoid integrating consumeDeliveredReply directly into the worker until reservation semantics are implemented. This migration is pending isolated SQL execution and CI approval.
