# DRVO AutoRespond — Brand V2 Phase 08: Billing & Admin

## Goal and source of truth
Align the authenticated customer subscription, usage, manual InstaPay payment, invoices/refunds and platform administration surfaces with Brand V2 **Ink / Carbon / Signal Green**, while **retaining payment, accounting and access-control behavior**. See master #119, Phase issue #136. Source of approved brand colors is `src/app/globals.css`; customer and admin are light/dark responsive, not new stand-alone themes.

## Visual scope implemented
- Customer billing header, current plan, quota meters, pending transfer/grace warnings, renewal and payment-history sections: cleaner headings, keyboard focus and standard radii; unchanged visible business data.
- Plan selection and manual checkout: better responsive cards, touch target/focus/loading on copy and confirmation actions. Purple InstaPay provider identity is preserved; dark-mode provider text is adjusted for contrast on dark card.
- Billing documents/invoice: display-heading roles, responsive printable receipt/invoice surfaces. Print data and document source remain unchanged.
- Customer refund/cancellation UI: calmer hierarchy and visible pending/request vs approved/paid distinction.
- Platform admin layout/navigation: canonical **DRVO AutoRespond** name, compact semantic header/nav, visible keyboard focus and accessible status.
- Financial overview: removed old decorative Cyan and legacy product name, standardized editorial title/surfaces, kept actual confirmed receipts separate from run-rate estimates and pending requests.
- Subscriptions/filters: responsive 360px controls, focus states, clear read-only table, genuine status filters.
- Admin payment review: keyboard-openable row with Enter/Space, focused payment dialog, manual review reminder, preserved confirm/reject.
- Refunds: clearer search, status list and form focus, responsive modal, warning-colored requested refund, meaningful transfer verification reminder.
- Discounts: single-column fields on mobile, clear focus/touch targets, external creator promo link remains `https://drvoautorespond.com/promo/`.
- Financial ledger: readable responsive table, semantically different **actual** refunded sums and pending/failed/succeeded status. SQL aggregation, ledger signs and arithmetic unchanged.
- Billing admin actions: enhanced warning that refund-request != actual bank transfer; inputs and action focus.

## Financial and permission invariants
1. No changes to API routes, database schemas, SQL WHERE filters, payment provider/entitlement functions, quotes, plan limits or discount calculations.
2. Manual InstaPay confirmation **does not approve payment**. Owner/admin still verifies the transfer and payment status before a plan activates.
3. Customer refund request **does not transfer money or cancel the subscription**. Admin refund state only becomes `SUCCEEDED` after real transfer confirmation.
4. Finance ledger subtracts **SUCCEEDED** refund money from approved gross, not request or pending states. Discounts are not collected cash.
5. Platform routes continue requiring `requirePlatformAdmin()`. Refund readiness `isRefundProcessingAllowed()` and manual confirmation remain.
6. Preserve original InstaPay purple `#69338D`, rather than rebranding the payment provider DRVO green; use a readable light lavender on dark.
7. Status warning/destructive/info/success retain distinct semantics, not brand green for all states.
8. No automated payment/refund/financial actions were performed as part of this phase.

## Verification
- New `tests/unit/brand-v2-billing-admin.test.ts` covers 11 UI/accounting/permissions/source invariants, alongside existing payment-quote, invoice, InstaPay, refund, subscriptions and promotions tests.
- PR CI: Typecheck, Next production build, full unit/integration tests and Brand V2 inventory before integration merge.
- **Before releasing to `main`**, conduct actual authenticated browser review on 360/390/768/1280/1440, RTL and light/dark, keyboard/modal focus, non-sensitive test Instapay submission/rejection and admin verification, invoice receipts, valid/rejected discount and refund state transitions. No screenshots or live financial test are claimed complete.
- Existing official logo artwork/font remains until exact approved vector/licensed type assets are provided; final release PR #121 stays Draft.

Integration-only code branch: `feat/brand-v2-p08-billing-admin` → `feat/brand-v2`, **not Production main**.
