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

## ERP sync

Tools expected on Cashier (implemented in Cashier repo):

- `customer.list_changes`
- `invoice.list_changes`
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

Rollback plan: stop using CRM routes/APIs; leave tables in place (additive). Do not delete mirrored ERP rows without a backup. Historical migrations must not be edited.

## Deploy steps (safe)

1. Deploy Cashier connector routes + set `DRVOWA_OUTBOUND_TOKEN`.
2. Apply AutoRespond migration `104`.
3. Deploy AutoRespond feature build.
4. Pair/refresh ERP integration from Settings → Integrations.
5. Run manual ERP sync from `/dashboard/crm/erp`.
6. Verify Inbox CRM panel and one AI audience preview (no launch).
7. Only then test campaign draft → preflight → explicit launch on a consenting test recipient.
