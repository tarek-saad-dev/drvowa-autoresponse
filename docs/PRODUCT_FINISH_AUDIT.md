# PRODUCT_FINISH_AUDIT

Branch: `feature/product-finish-v1`  
Baseline: `8daf6c5`  
Date: 2026-09-21

## Summary

Core flows (auth, WhatsApp pairing, agent, knowledge) are usable. Highest gaps: developer-facing gate strings, deferred nav items, weak dashboard/inbox UX, English defaults, UTC/engineering billing copy.

## Route classification

| Route | Status | Priority fixes |
|-------|--------|----------------|
| `/` | functional-but-weak | Soften deferred marketing; keep CTA clear |
| `/login` `/signup` | polished | Arabic error mapping; terms link on signup |
| `/forgot-password` | polished | Keep honesty when email off |
| `/reset-password` | polished | Never show raw codes |
| `/onboarding` | functional-but-weak | Arabic defaults; end CTA → WhatsApp |
| `/dashboard` | inconsistent | Operational home; no blank null; Arabic WA status |
| `/dashboard/agent` | polished+ | Arabic role; clearer auto-reply |
| `/dashboard/knowledge` | polished+ | Teaching empty state; X of Y active |
| `/dashboard/whatsapp` | polished+ | Soften runtime copy; all states human |
| `/dashboard/inbox` | functional-but-weak | Polling; mobile master-detail; Arabic AI labels |
| `/dashboard/billing` | developer-facing | No EXTERNAL_GATE; no plan codes; soft upgrade copy |
| `/dashboard/usage` | functional-but-weak | Progress bars; friendly renew date |
| `/dashboard/settings` | functional-but-weak | Hide slug; sections |
| `/dashboard/locations` | polished | Keep |
| `/dashboard/contacts` | unnecessary | Remove from nav |
| `/dashboard/integrations` | unnecessary | Remove from nav |
| `/privacy` `/terms` | developer-facing | No EXTERNAL_GATE; soft draft wording |

## Developer strings to remove from UI

- `EXTERNAL_GATE_*`
- Plan codes next to names (optional hide)
- Raw subscription status enums
- `"AI receptionist"`, `"AI نشط"`
- `خارج V1` in primary nav
- `[COMPANY_NAME]` / `[SUPPORT_EMAIL]` when unset → soft Arabic placeholders

## Implementation order

1. Nav + copy gates
2. Design primitives (Progress, EmptyState)
3. Dashboard home
4. Onboarding
5. WhatsApp / Agent / Knowledge
6. Inbox major pass
7. Usage / Billing / Settings
8. E2E + quality gate
