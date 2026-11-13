# CRM Phase 1 — Architecture & Operations

## Summary

CRM Phase 1 adds a unified customer layer, ERP mirror sync, AI audience builder, follow-ups, and an Inbox CRM panel inside DRVO AutoRespond. It does **not** replace WhatsApp contacts, escalations, or the existing campaign delivery engine.

## Architecture

```
ERP (Cashier) → /api/integrations/drvowa/v1/tools/*
  → AutoRespond Integration Layer (connector-client)
  → CRM mirror tables (TblErp*)
  → Customer 360 + Audience compiler

User NL → Gemini JSON AST → Zod validate → Parameterized SQL → Preview
  → Optional freeze snapshot → Existing WhatsApp list/campaign draft APIs
  → Explicit owner launch (existing preflight + permission + opt-out)
```

## Database

Migration: `104_crm_phase1_foundation.sql`

Key tables: `TblCrmCustomer`, phones, tags, contact links, notes, activities, follow-ups, segments, audience snapshots, ERP sync state, invoice/line mirrors, service catalog, audience query audit, campaign builder sessions.

## AI query security

1. Model outputs **only** `AudienceFilterAst` JSON.
2. Server validates with Zod allowlist (`audience-ast.ts`).
3. Compiler emits parameterized, `BusinessID`-scoped read-only SQL (`audience-compiler.ts`).
4. No LLM SQL execution tools. No dynamic table names. Max rows 2000. Timeout 8s. Audit log required.

## Campaign permission

ERP history or a phone number is **not** consent. Recipients must pass existing `TblWhatsAppCampaignPermission` and must not be in `TblWhatsAppCampaignOptOut`. Launch always requires an explicit final UI confirmation. AI never auto-sends.

### Channel binding (fail-closed)

- Every audience eligibility check, freeze snapshot, WhatsApp list, and campaign draft must use the **same** `ChannelConnectionID`.
- Zero active WhatsApp channels → reject. Multiple active channels → require explicit UI selection (no silent default).
- Never fall back to cross-channel permission/opt-out checks.
- Preview `eligibleMarketing` is **preview_page** scoped; the builder freezes + revalidates the full audience and requires confirmation of the **final** eligible count and selected channel before creating a draft.
- Delivery-time permission/opt-out checks remain in the existing campaign launch/worker path.

## ERP sync

Tools expected on Cashier (implemented in Cashier repo):

- `customer.list_changes`
- `invoice.list_changes` (append `sinceInvId` + rotating `statusSweep` so late cancellations are not permanently missed)
- `catalog.list_services`

Valid sale rule: `invType = N'مبيعات'` and legacy `isActive <> 'yes'`. Sync does not overwrite CRM notes, tags, or assignments.

## Routes

- `/dashboard/contacts`, `/dashboard/contacts/[customerId]`
- `/dashboard/crm/follow-ups`, `/dashboard/crm/segments`, `/dashboard/crm/erp`
- `/dashboard/campaigns`, `/dashboard/campaigns/create`

## Migration / rollback

```bash
npm run db:migrate
npm run db:status
```

Migration `104` note: `TblCrmAudienceQueryAudit.MatchedRowCount` (not `RowCount`) — `RowCount` is a SQL Server reserved keyword and caused `Incorrect syntax near 'ACTION'` during CI apply.

Rollback plan: stop using CRM routes/APIs; leave tables in place (additive). Do not delete mirrored ERP rows without a backup. Historical migrations must not be edited.

## Release fixes (PR follow-up)

- Audience preview is paginated (`AUDIENCE_PREVIEW_PAGE_SIZE`); freeze materializes up to `AUDIENCE_SNAPSHOT_MAX_ROWS` (2000) and fails closed if larger.
- Campaign builder freezes + revalidates channel-scoped eligibility before creating WhatsApp lists/drafts.
- ERP `isValidSale` requires invoice type `مبيعات` and non-cancelled legacy `isActive`.
- ERP sync reports `PARTIAL` (not `SUCCESS`) when page caps stop a resumable run mid-cursor.
- Inbox CRM panel respects MEMBER assignment restrictions for notes/ERP/financial data.

## Deploy steps (safe)

1. Deploy Cashier connector routes + set `DRVOWA_OUTBOUND_TOKEN`.
2. Apply AutoRespond migration `104`.
3. Deploy AutoRespond feature build.
4. Pair/refresh ERP integration from Settings → Integrations.
5. Run manual ERP sync from `/dashboard/crm/erp`.
6. Verify Inbox CRM panel and one AI audience preview (no launch).
7. Only then test campaign draft → preflight → explicit launch on a consenting test recipient.
