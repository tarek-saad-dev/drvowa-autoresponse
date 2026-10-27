# V1 backend quote (draft only)

The pure quote helper in `src/modules/pricing/payment-quote.ts` defines the server-authoritative monthly and annual values. It rejects FREE and unknown plans. Its activation guard is deliberately false for production while the catalog remains draft.

**Crucial:** The current payment intent still derives live prices from `TblPlan`, and the current UI shows the legacy prices including annual ×12. The helper is NOT wired to checkout, because the draft V1 has no per-business pricing version or persisted entitlements. A split UI / backend quote would cause customers to transfer the wrong amount.

Next work must atomically add catalog version snapshots and quote selection in the payment intent, render exactly that server quote to the user, and preserve existing subscriptions. Do not enable V1 in production based on this helper alone.
