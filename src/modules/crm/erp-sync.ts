import { randomUUID } from "node:crypto";

import { ConflictError, NotFoundError, ValidationError } from "@/lib/tenancy/errors";
import { callIntegrationTool } from "@/modules/integrations/connector-client";
import { refreshExternalIntegrationManifest } from "@/modules/integrations/service";
import type { IntegrationManifest } from "@/modules/integrations/contracts";
import {
  getIntegrationByType,
  INTEGRATION_TYPE_DRVO_ERP,
} from "@/modules/integrations/repository";

import { normalizeErpCustomerPhone } from "./erp-phone";
import { importCashierWhatsAppOffersConsent } from "./erp-marketing-consent";
import * as repo from "./repository";

const RESOURCE_CUSTOMERS = "customers";
const RESOURCE_INVOICES = "invoices";
const RESOURCE_CATALOG = "catalog";

/** A full page may have successors. Only an empty/short append page proves completion.
 * Rotating history sweeps are bounded separately; they do not complete the append stream.
 */
export function isErpAppendPageExhausted(rowsInPage: number, pageSize: number): boolean {
  return rowsInPage < pageSize;
}


type CursorBag = Record<string, unknown>;

function parseCursor(raw: string | null | undefined): CursorBag {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as CursorBag) : {};
  } catch {
    return {};
  }
}

function hasTool(manifest: IntegrationManifest | null, name: string): boolean {
  return Boolean(manifest?.tools.some((t) => t.name === name));
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function str(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  return s.length ? s : null;
}

function num(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

const ERP_SALE_INV_TYPE = "مبيعات";

function isInvoiceCancelled(payload: Record<string, unknown>): boolean {
  if (payload.isDeleted === true || payload.deleted === true) return true;
  const isActive = str(payload.isActive)?.toLowerCase();
  // Legacy Cut Salon: isActive='yes' means cancelled/voided.
  if (isActive === "yes") return true;
  const status = str(payload.status)?.toLowerCase();
  if (status === "deleted" || status === "cancelled" || status === "canceled") return true;
  return false;
}

/** Valid CRM sales require Cashier sale type + non-cancelled status. */
export function isValidErpSaleInvoice(payload: Record<string, unknown>): boolean {
  const invType = str(payload.invType ?? payload.InvType);
  if (invType !== ERP_SALE_INV_TYPE) return false;
  if (isInvoiceCancelled(payload)) return false;
  const status = str(payload.status)?.toLowerCase();
  if (status && status !== "active") return false;
  return true;
}

/** Stable mirror identity: Cashier invoice keys are (invID, invType). */
export function erpInvoiceExternalKey(payload: Record<string, unknown>): string | null {
  const invId = str(payload.invId ?? payload.InvID ?? payload.externalInvId);
  if (!invId) return null;
  const invType = str(payload.invType ?? payload.InvType) ?? ERP_SALE_INV_TYPE;
  return `${invType}:${invId}`;
}

async function loadManifest(integration: {
  capabilitiesJson?: string | null;
}): Promise<IntegrationManifest | null> {
  if (!integration.capabilitiesJson) return null;
  try {
    return JSON.parse(integration.capabilitiesJson) as IntegrationManifest;
  } catch {
    return null;
  }
}

async function ensureCrmCustomerFromErp(params: {
  businessId: string;
  clientId: string | null;
  name: string | null;
  mobile: string | null;
  phone: string | null;
  email: string | null;
}): Promise<string | null> {
  // Don't trust a source phone just because an initial normalization returned
  // digits: repository.createCustomer/updateCustomer normalize it AGAIN.
  // Invalid or ambiguous numbers are not WhatsApp recipients; stable ERP IDs
  // still allow retaining those customers and attaching later invoices.
  const phone = normalizeErpCustomerPhone(params.mobile, params.phone);

  if (params.clientId) {
    const byErp = await repo.getCustomerByErpClientId({
      businessId: params.businessId,
      externalErpClientId: params.clientId,
    });
    if (byErp) {
      // Preserve existing CRM contact/assignment when the incoming ERP phone
      // is malformed or missing; never re-submit an old invalid phone value.
      const nextName = params.name?.trim() || byErp.fullName;
      const nextEmail = params.email?.trim() || byErp.email;
      let phoneForUpdate = phone;
      if (phone && phone !== byErp.primaryPhoneNormalized) {
        const phoneOwner = await repo.getCustomerByPhone({
          businessId: params.businessId,
          phoneNormalized: phone,
        });
        // A shared phone must not overwrite a *different* customer's
        // primary phone on later sync runs; this also keeps sync idempotent.
        if (phoneOwner && phoneOwner.customerId !== byErp.customerId) {
          phoneForUpdate = null;
        }
      }
      const phoneChanged = Boolean(
        phoneForUpdate && phoneForUpdate !== byErp.primaryPhoneNormalized,
      );
      if (phoneChanged || nextName !== byErp.fullName || nextEmail !== byErp.email) {
        await repo.updateCustomer({
          businessId: params.businessId,
          customerId: byErp.customerId,
          ...(phoneChanged ? { primaryPhoneNormalized: phoneForUpdate } : {}),
          email: nextEmail,
          fullName: nextName,
          externalErpClientId: params.clientId,
        });
      }
      return byErp.customerId;
    }
  }

  let phoneForCreation = phone;
  if (phone) {
    const byPhone = await repo.getCustomerByPhone({
      businessId: params.businessId,
      phoneNormalized: phone,
    });
    if (byPhone) {
      // A reused/duplicate phone is NOT evidence that two different Cashier
      // client IDs are the same person. Keep their ERP identities separate.
      if (params.clientId && byPhone.externalErpClientId &&
        byPhone.externalErpClientId !== params.clientId) {
        phoneForCreation = null;
      } else {
        if (!byPhone.externalErpClientId && params.clientId) {
          await repo.updateCustomer({
            businessId: params.businessId,
            customerId: byPhone.customerId,
            externalErpClientId: params.clientId,
            email: byPhone.email ?? params.email,
          });
        }
        return byPhone.customerId;
      }
    }
  }

  if (!params.clientId && !phoneForCreation) return null;

  const created = await repo.createCustomer({
    businessId: params.businessId,
    fullName: params.name?.trim() || `عميل ERP ${params.clientId ?? phoneForCreation ?? ""}`.trim(),
    primaryPhoneNormalized: phoneForCreation,
    email: params.email,
    source: "ERP",
    status: "ACTIVE",
    externalErpClientId: params.clientId,
  });
  return created.customerId;
}

/**
 * Bound each HTTP request to one append page and, only at the end of the
 * initial append stream, one small reconciliation page. Do not combine
 * thousands of ERP records in a single nginx request.
 */
export const CRM_ERP_SYNC_BATCH = {
  customers: 25,
  invoices: 10,
  catalog: 40,
} as const;
const MAX_APPEND_PAGES_PER_REQUEST = 1;
const MAX_RECONCILE_PAGES_PER_REQUEST = 1;

async function syncCustomers(params: {
  businessId: string;
  integration: Awaited<ReturnType<typeof getIntegrationByType>>;
  manifest: IntegrationManifest | null;
}): Promise<{ synced: number; skipped: boolean }> {
  if (!params.integration) return { synced: 0, skipped: true };
  if (!hasTool(params.manifest, "customer.list_changes")) {
    return { synced: 0, skipped: true };
  }

  await repo.upsertErpSyncState({
    businessId: params.businessId,
    integrationId: params.integration.integrationId,
    resource: RESOURCE_CUSTOMERS,
    status: "RUNNING",
  });

  try {
    const state = await repo.getErpSyncState({
      businessId: params.businessId,
      resource: RESOURCE_CUSTOMERS,
    });
    let cursor = parseCursor(state?.cursorJson);
    let synced = 0;
    let pages = 0;
    let appendComplete = false;

    const applyCustomerPage = async (customers: unknown[]) => {
      for (const item of customers) {
        const row = asRecord(item);
        if (!row) continue;
        const clientId = str(row.clientId ?? row.ClientID);
        const mobile = str(row.mobile ?? row.Mobile);
        const phone = str(row.phone ?? row.Phone);
        const customerId = await ensureCrmCustomerFromErp({
          businessId: params.businessId,
          clientId,
          name: str(row.name ?? row.Name),
          mobile,
          phone,
          email: str(row.email ?? row.Email),
        });
        if (customerId && clientId && row.whatsAppOffersConsentEvidence) {
          await importCashierWhatsAppOffersConsent({
            businessId: params.businessId,
            customerId,
            externalClientId: clientId,
            mobile,
            phone,
            proofPhone: str(row.whatsAppOffersConsentPhone),
            consentedAtUtc: str(row.whatsAppOffersConsentedAtUtc),
            evidence: str(row.whatsAppOffersConsentEvidence),
          });
        }
        synced += 1;
      }
    };

    while (pages < MAX_APPEND_PAGES_PER_REQUEST) {
      pages += 1;
      const result = await callIntegrationTool({
        integration: params.integration,
        tool: "customer.list_changes",
        input: {
          sinceClientId: cursor.sinceClientId ?? 0,
          identitySweepSinceClientId: cursor.identitySweepSinceClientId ?? 0,
          identitySweep: false,
          limit: CRM_ERP_SYNC_BATCH.customers,
        },
        requestId: randomUUID(),
      });
      if (!result.ok) {
        throw new ValidationError(result.error?.message ?? "فشل مزامنة العملاء من ERP");
      }
      const data = asRecord(result.data);
      const customers = asArray(data?.customers);
      if (!customers.length) {
        appendComplete = true;
        break;
      }

      await applyCustomerPage(customers);

      const next = asRecord(data?.nextCursor) ?? {};
      const nextId = num(next.sinceClientId ?? next.clientId);
      if (nextId == null || nextId <= Number(cursor.sinceClientId ?? 0)) {
        throw new ValidationError("توقفت مزامنة العملاء: المؤشر لم يتقدم");
      }
      cursor = {
        ...cursor,
        ...next,
        sinceClientId: nextId,
        identitySweepSinceClientId:
          num(next.identitySweepSinceClientId) ?? cursor.identitySweepSinceClientId ?? 0,
      };
      await repo.upsertErpSyncState({
        businessId: params.businessId,
        integrationId: params.integration.integrationId,
        resource: RESOURCE_CUSTOMERS,
        cursorJson: JSON.stringify(cursor),
        status: "RUNNING",
      });
      if (isErpAppendPageExhausted(customers.length, CRM_ERP_SYNC_BATCH.customers)) {
        appendComplete = true;
        break;
      }
    }

    // One rotating identity-sweep page per sync so existing client edits are not missed.
    while (appendComplete && pages < MAX_APPEND_PAGES_PER_REQUEST + MAX_RECONCILE_PAGES_PER_REQUEST) {
      pages += 1;
      const result = await callIntegrationTool({
        integration: params.integration,
        tool: "customer.list_changes",
        input: {
          sinceClientId: cursor.sinceClientId ?? 0,
          identitySweepSinceClientId: cursor.identitySweepSinceClientId ?? 0,
          identitySweep: true,
          limit: CRM_ERP_SYNC_BATCH.customers,
        },
        requestId: randomUUID(),
      });
      if (!result.ok) {
        throw new ValidationError(result.error?.message ?? "فشل إعادة تحقق هوية عملاء ERP");
      }
      const data = asRecord(result.data);
      const customers = asArray(data?.customers);
      if (!customers.length) {
        cursor = { ...cursor, identitySweepSinceClientId: 0 };
        break;
      }
      await applyCustomerPage(customers);
      const next = asRecord(data?.nextCursor) ?? {};
      cursor = {
        ...cursor,
        identitySweepSinceClientId: num(next.identitySweepSinceClientId) ?? 0,
      };
      await repo.upsertErpSyncState({
        businessId: params.businessId,
        integrationId: params.integration.integrationId,
        resource: RESOURCE_CUSTOMERS,
        cursorJson: JSON.stringify(cursor),
        status: "RUNNING",
      });
      break;
    }

    const incomplete = !appendComplete;
    await repo.upsertErpSyncState({
      businessId: params.businessId,
      integrationId: params.integration.integrationId,
      resource: RESOURCE_CUSTOMERS,
      cursorJson: JSON.stringify(cursor),
      status: incomplete ? "PARTIAL" : "SUCCESS",
      markSuccess: !incomplete,
      lastErrorCode: incomplete ? "SYNC_INCOMPLETE" : null,
      lastErrorMessage: incomplete
        ? "تمت مزامنة جزء من العملاء — أعد المزامنة لاستكمال الصفحات التالية"
        : null,
    });
    return { synced, skipped: false };
  } catch (error) {
    await repo.upsertErpSyncState({
      businessId: params.businessId,
      integrationId: params.integration.integrationId,
      resource: RESOURCE_CUSTOMERS,
      status: "ERROR",
      incrementRetry: true,
      lastErrorCode: "CUSTOMER_SYNC_FAILED",
      lastErrorMessage: error instanceof Error ? error.message.slice(0, 1000) : "خطأ غير معروف",
    });
    throw error;
  }
}

async function syncInvoices(params: {
  businessId: string;
  integration: NonNullable<Awaited<ReturnType<typeof getIntegrationByType>>>;
  manifest: IntegrationManifest | null;
}): Promise<{ synced: number; skipped: boolean }> {
  if (!hasTool(params.manifest, "invoice.list_changes")) {
    return { synced: 0, skipped: true };
  }

  await repo.upsertErpSyncState({
    businessId: params.businessId,
    integrationId: params.integration.integrationId,
    resource: RESOURCE_INVOICES,
    status: "RUNNING",
  });

  try {
    const state = await repo.getErpSyncState({
      businessId: params.businessId,
      resource: RESOURCE_INVOICES,
    });
    let cursor = parseCursor(state?.cursorJson);
    let synced = 0;
    let pages = 0;
    let appendComplete = false;

    const applyInvoicePage = async (invoices: unknown[], opts: { recordActivity: boolean }) => {
      for (const item of invoices) {
        const row = asRecord(item);
        if (!row) continue;
        const externalInvId = erpInvoiceExternalKey(row);
        if (!externalInvId) continue;
        const invId = str(row.invId ?? row.InvID) ?? externalInvId;
        const clientId = str(row.clientId ?? row.ClientID);
        const customerName = str(row.clientName ?? row.customerName);
        const mobile = str(row.mobile ?? row.Mobile);
        const cancelled = isInvoiceCancelled(row);
        const validSale = isValidErpSaleInvoice(row);

        const customerId = await ensureCrmCustomerFromErp({
          businessId: params.businessId,
          clientId,
          name: customerName,
          mobile,
          phone: str(row.phone),
          email: null,
        });

        const lines = asArray(row.lines).map((line) => {
          const l = asRecord(line) ?? {};
          const qty = num(l.qty ?? l.Qty) ?? 1;
          const unitPrice = num(l.sPrice ?? l.unitPrice ?? l.SPrice) ?? 0;
          const lineTotal =
            num(l.lineTotal ?? l.sPriceAfterDis ?? l.SPriceAfterDis)
            ?? qty * unitPrice;
          return {
            externalProId: str(l.proId ?? l.ProID),
            externalEmpId: str(l.empId ?? l.EmpID),
            proType: str(l.proType ?? l.ProType),
            proName: str(l.proName ?? l.ProName),
            empName: str(l.empName ?? l.EmpName),
            qty,
            unitPrice,
            lineTotal,
          };
        });

        await repo.upsertErpInvoiceMirror({
          businessId: params.businessId,
          invoice: {
            externalInvId,
            externalClientId: clientId,
            customerId,
            invType: str(row.invType ?? row.InvType),
            invDate: str(row.invDate ?? row.InvDate)?.slice(0, 10) ?? null,
            invTime: str(row.invTime ?? row.InvTime),
            branchId: num(row.branchId ?? row.BranchID),
            branchName: str(row.branchName ?? row.BranchName),
            grandTotal: num(row.grandTotal ?? row.GrandTotal) ?? 0,
            subTotal: num(row.subTotal ?? row.SubTotal) ?? 0,
            discountValue: num(row.disVal ?? row.discountValue ?? row.DisVal) ?? 0,
            isValidSale: validSale,
            isDeleted: cancelled,
            rawStatus: cancelled
              ? "CANCELLED"
              : validSale
                ? "ACTIVE"
                : str(row.status) ?? "INVALID",
            lines,
          },
        });

        if (opts.recordActivity && customerId && validSale) {
          await repo.insertErpInvoiceActivityOnce({
            businessId: params.businessId,
            customerId,
            externalInvId,
            title: `فاتورة ERP #${invId}`,
          });
        }
        synced += 1;
      }
    };

    // 1) Append-only stream for new invoice IDs (includes newly inserted cancelled rows).
    while (pages < MAX_APPEND_PAGES_PER_REQUEST) {
      pages += 1;
      const result = await callIntegrationTool({
        integration: params.integration,
        tool: "invoice.list_changes",
        input: {
          sinceInvId: cursor.sinceInvId ?? 0,
          statusSweepSinceInvId: cursor.statusSweepSinceInvId ?? 0,
          includeInactive: true,
          statusSweep: false,
          limit: CRM_ERP_SYNC_BATCH.invoices,
        },
        requestId: randomUUID(),
      });
      if (!result.ok) {
        throw new ValidationError(result.error?.message ?? "فشل مزامنة الفواتير من ERP");
      }
      const data = asRecord(result.data);
      const invoices = asArray(data?.invoices);
      if (!invoices.length) {
        appendComplete = true;
        break;
      }

      await applyInvoicePage(invoices, { recordActivity: true });

      const next = asRecord(data?.nextCursor) ?? {};
      const nextId = num(next.sinceInvId ?? next.invId);
      if (nextId == null || nextId <= Number(cursor.sinceInvId ?? 0)) {
        throw new ValidationError("توقفت مزامنة الفواتير: المؤشر لم يتقدم");
      }
      cursor = {
        ...cursor,
        ...next,
        sinceInvId: nextId,
        statusSweepSinceInvId: num(next.statusSweepSinceInvId) ?? cursor.statusSweepSinceInvId ?? 0,
      };
      await repo.upsertErpSyncState({
        businessId: params.businessId,
        integrationId: params.integration.integrationId,
        resource: RESOURCE_INVOICES,
        cursorJson: JSON.stringify(cursor),
        status: "RUNNING",
      });
      if (isErpAppendPageExhausted(invoices.length, CRM_ERP_SYNC_BATCH.invoices)) {
        appendComplete = true;
        break;
      }
    }

    // 2) Rotating status sweep so late cancellations of already-synced IDs are not missed.
    while (appendComplete && pages < MAX_APPEND_PAGES_PER_REQUEST + MAX_RECONCILE_PAGES_PER_REQUEST) {
      pages += 1;
      const result = await callIntegrationTool({
        integration: params.integration,
        tool: "invoice.list_changes",
        input: {
          sinceInvId: cursor.sinceInvId ?? 0,
          statusSweepSinceInvId: cursor.statusSweepSinceInvId ?? 0,
          statusSweep: true,
          includeInactive: true,
          limit: CRM_ERP_SYNC_BATCH.invoices,
        },
        requestId: randomUUID(),
      });
      if (!result.ok) {
        throw new ValidationError(result.error?.message ?? "فشل إعادة تحقق حالة فواتير ERP");
      }
      const data = asRecord(result.data);
      const invoices = asArray(data?.invoices);
      if (!invoices.length) {
        cursor = { ...cursor, statusSweepSinceInvId: 0 };
        break;
      }

      await applyInvoicePage(invoices, { recordActivity: false });

      const next = asRecord(data?.nextCursor) ?? {};
      const nextSweep = num(next.statusSweepSinceInvId);
      cursor = {
        ...cursor,
        statusSweepSinceInvId: nextSweep ?? 0,
      };
      await repo.upsertErpSyncState({
        businessId: params.businessId,
        integrationId: params.integration.integrationId,
        resource: RESOURCE_INVOICES,
        cursorJson: JSON.stringify(cursor),
        status: "RUNNING",
      });
      // One reconcile page per sync run keeps the job bounded; cursor resumes next run.
      break;
    }

    const incomplete = !appendComplete;
    await repo.upsertErpSyncState({
      businessId: params.businessId,
      integrationId: params.integration.integrationId,
      resource: RESOURCE_INVOICES,
      cursorJson: JSON.stringify(cursor),
      status: incomplete ? "PARTIAL" : "SUCCESS",
      markSuccess: !incomplete,
      lastErrorCode: incomplete ? "SYNC_INCOMPLETE" : null,
      lastErrorMessage: incomplete
        ? "تمت مزامنة جزء من الفواتير — أعد المزامنة لاستكمال الصفحات التالية"
        : null,
    });
    return { synced, skipped: false };
  } catch (error) {
    await repo.upsertErpSyncState({
      businessId: params.businessId,
      integrationId: params.integration.integrationId,
      resource: RESOURCE_INVOICES,
      status: "ERROR",
      incrementRetry: true,
      lastErrorCode: "INVOICE_SYNC_FAILED",
      lastErrorMessage: error instanceof Error ? error.message.slice(0, 1000) : "خطأ غير معروف",
    });
    throw error;
  }
}

async function syncCatalog(params: {
  businessId: string;
  integration: NonNullable<Awaited<ReturnType<typeof getIntegrationByType>>>;
  manifest: IntegrationManifest | null;
}): Promise<{ synced: number; skipped: boolean }> {
  if (!hasTool(params.manifest, "catalog.list_services")) {
    return { synced: 0, skipped: true };
  }

  await repo.upsertErpSyncState({
    businessId: params.businessId,
    integrationId: params.integration.integrationId,
    resource: RESOURCE_CATALOG,
    status: "RUNNING",
  });

  try {
    const state = await repo.getErpSyncState({
      businessId: params.businessId,
      resource: RESOURCE_CATALOG,
    });
    let cursor = parseCursor(state?.cursorJson);
    let synced = 0;
    let pages = 0;
    let appendComplete = false;

    const applyCatalogPage = async (services: unknown[]) => {
      for (const item of services) {
        const row = asRecord(item);
        if (!row) continue;
        const proId = str(row.proId ?? row.externalProId ?? row.ProID);
        const proName = str(row.proName ?? row.name ?? row.ProName);
        if (!proId || !proName) continue;
        await repo.upsertErpServiceCatalog({
          businessId: params.businessId,
          externalProId: proId,
          proType: str(row.proType ?? row.ProType),
          proName,
          proNameAr: str(row.proNameAr ?? row.ProNameAr),
          categoryName: str(row.categoryName ?? row.category),
          isDeleted: row.isDeleted === true,
        });
        synced += 1;
      }
    };

    while (pages < MAX_APPEND_PAGES_PER_REQUEST) {
      pages += 1;
      const result = await callIntegrationTool({
        integration: params.integration,
        tool: "catalog.list_services",
        input: {
          sinceProId: cursor.sinceProId ?? 0,
          identitySweepSinceProId: cursor.identitySweepSinceProId ?? 0,
          identitySweep: false,
          limit: CRM_ERP_SYNC_BATCH.catalog,
        },
        requestId: randomUUID(),
      });
      if (!result.ok) {
        throw new ValidationError(result.error?.message ?? "فشل مزامنة كتالوج الخدمات");
      }
      const data = asRecord(result.data);
      const services = asArray(data?.services ?? data?.items);
      if (!services.length) {
        appendComplete = true;
        break;
      }

      await applyCatalogPage(services);

      const next = asRecord(data?.nextCursor) ?? {};
      const nextId = num(next.sinceProId ?? next.proId);
      if (nextId == null || nextId <= Number(cursor.sinceProId ?? 0)) {
        throw new ValidationError("توقفت مزامنة الكتالوج: المؤشر لم يتقدم");
      }
      cursor = {
        ...cursor,
        ...next,
        sinceProId: nextId,
        identitySweepSinceProId:
          num(next.identitySweepSinceProId) ?? cursor.identitySweepSinceProId ?? 0,
      };
      await repo.upsertErpSyncState({
        businessId: params.businessId,
        integrationId: params.integration.integrationId,
        resource: RESOURCE_CATALOG,
        cursorJson: JSON.stringify(cursor),
        status: "RUNNING",
      });
      if (isErpAppendPageExhausted(services.length, CRM_ERP_SYNC_BATCH.catalog)) {
        appendComplete = true;
        break;
      }
    }

    while (appendComplete && pages < MAX_APPEND_PAGES_PER_REQUEST + MAX_RECONCILE_PAGES_PER_REQUEST) {
      pages += 1;
      const result = await callIntegrationTool({
        integration: params.integration,
        tool: "catalog.list_services",
        input: {
          sinceProId: cursor.sinceProId ?? 0,
          identitySweepSinceProId: cursor.identitySweepSinceProId ?? 0,
          identitySweep: true,
          limit: CRM_ERP_SYNC_BATCH.catalog,
        },
        requestId: randomUUID(),
      });
      if (!result.ok) {
        throw new ValidationError(result.error?.message ?? "فشل إعادة تحقق كتالوج ERP");
      }
      const data = asRecord(result.data);
      const services = asArray(data?.services ?? data?.items);
      if (!services.length) {
        cursor = { ...cursor, identitySweepSinceProId: 0 };
        break;
      }
      await applyCatalogPage(services);
      const next = asRecord(data?.nextCursor) ?? {};
      cursor = {
        ...cursor,
        identitySweepSinceProId: num(next.identitySweepSinceProId) ?? 0,
      };
      await repo.upsertErpSyncState({
        businessId: params.businessId,
        integrationId: params.integration.integrationId,
        resource: RESOURCE_CATALOG,
        cursorJson: JSON.stringify(cursor),
        status: "RUNNING",
      });
      break;
    }

    const incomplete = !appendComplete;
    await repo.upsertErpSyncState({
      businessId: params.businessId,
      integrationId: params.integration.integrationId,
      resource: RESOURCE_CATALOG,
      cursorJson: JSON.stringify({ ...cursor, syncedAt: new Date().toISOString() }),
      status: incomplete ? "PARTIAL" : "SUCCESS",
      markSuccess: !incomplete,
      lastErrorCode: incomplete ? "SYNC_INCOMPLETE" : null,
      lastErrorMessage: incomplete
        ? "تمت مزامنة جزء من الكتالوج — أعد المزامنة لاستكمال الصفحات التالية"
        : null,
    });
    return { synced, skipped: false };
  } catch (error) {
    await repo.upsertErpSyncState({
      businessId: params.businessId,
      integrationId: params.integration.integrationId,
      resource: RESOURCE_CATALOG,
      status: "ERROR",
      incrementRetry: true,
      lastErrorCode: "CATALOG_SYNC_FAILED",
      lastErrorMessage: error instanceof Error ? error.message.slice(0, 1000) : "خطأ غير معروف",
    });
    throw error;
  }
}

export type ErpSyncResource = "customers" | "invoices" | "catalog";
const activeErpSyncByBusiness = new Set<string>();

export async function syncErpForBusiness(params: {
  businessId: string;
  resource?: ErpSyncResource;
}): Promise<{
  customers: { synced: number; skipped: boolean };
  invoices: { synced: number; skipped: boolean };
  catalog: { synced: number; skipped: boolean };
}> {
  if (activeErpSyncByBusiness.has(params.businessId)) {
    throw new ConflictError("مزامنة Cashier شغالة بالفعل؛ حدّث الحالة بعد اكتمال الدفعة الحالية.");
  }
  activeErpSyncByBusiness.add(params.businessId);
  try {
    const integration = await getIntegrationByType({
      businessId: params.businessId,
      type: INTEGRATION_TYPE_DRVO_ERP,
    });
    if (!integration || integration.status !== "ACTIVE") {
      throw new NotFoundError("ربط DRVO ERP غير مفعّل");
    }

    // Source probe reads the LIVE manifest; sync must do the same.
    // External pairing can leave CapabilitiesJson empty/stale even while its
    // authenticated READ tools are currently reachable.
    let manifest: IntegrationManifest;
    try {
      manifest = await refreshExternalIntegrationManifest({ integration });
    } catch {
      throw new ValidationError(
        "تعذر تحديث أدوات Cashier الفعلية. جرّب «اختبار مصدر Cashier» وتحقق من الاتصال والتصريح.",
      );
    }
    // An ACTIVE connector and cached UI tool names are not proof that a sync
    // can run. Never report a successful no-op when its manifest lacks tools.
    for (const requiredTool of [
      "customer.list_changes",
      "invoice.list_changes",
      "catalog.list_services",
    ]) {
      if (!hasTool(manifest, requiredTool)) {
        throw new ValidationError(
          "مصدر Cashier الحالي لا يعلن أداة المزامنة المطلوبة (" + requiredTool + "). افحص المصدر ثم راجع إصدار Connector.",
        );
      }
    }
    const skipped = { synced: 0, skipped: true };
    const customers = !params.resource || params.resource === "customers"
      ? await syncCustomers({ businessId: params.businessId, integration, manifest })
      : skipped;
    const invoices = !params.resource || params.resource === "invoices"
      ? await syncInvoices({ businessId: params.businessId, integration, manifest })
      : skipped;
    const catalog = !params.resource || params.resource === "catalog"
      ? await syncCatalog({ businessId: params.businessId, integration, manifest })
      : skipped;
    if (
      (params.resource ? { customers, invoices, catalog }[params.resource].skipped
        : customers.skipped || invoices.skipped || catalog.skipped)
    ) {
      throw new ValidationError("لم يتم تشغيل أداة المزامنة المطلوبة. راجع اتصال Cashier.");
    }

    // Do not run dozens of contact lookups on every 25-customer import
    // chunk. Defer this optional link pass until the customer append completes.
    if ((!params.resource || params.resource === "customers") &&
        (await repo.getErpSyncState({
          businessId: params.businessId,
          resource: RESOURCE_CUSTOMERS,
        }))?.status === "SUCCESS") {
      const contacts = await repo.listUnlinkedWhatsAppContacts({
        businessId: params.businessId,
        limit: 25,
      });
      for (const contact of contacts) {
        if (!contact.phoneNormalized) continue;
        const match = await repo
          .getCustomerByPhone({
            businessId: params.businessId,
            phoneNormalized: contact.phoneNormalized,
          })
          .catch(() => null);
        if (!match) continue;
        await repo
          .linkContactToCustomer({
            businessId: params.businessId,
            customerId: match.customerId,
            contactId: contact.contactId,
            linkSource: "PHONE_MATCH",
          })
          .catch(() => null);
      }
    }

  return { customers, invoices, catalog };
  } finally {
    activeErpSyncByBusiness.delete(params.businessId);
  }

}

export async function getErpSyncStatus(params: { businessId: string }) {
  const integration = await getIntegrationByType({
    businessId: params.businessId,
    type: INTEGRATION_TYPE_DRVO_ERP,
  });
  const [states, mirrorCounts] = await Promise.all([
    repo.listErpSyncStates({ businessId: params.businessId }),
    repo.getCrmErpMirrorCounts({ businessId: params.businessId }),
  ]);
  const manifest = integration ? await loadManifest(integration) : null;
  return {
    connected: Boolean(integration && integration.status === "ACTIVE"),
    mirrorCounts,
    integrationId: integration?.integrationId ?? null,
    integrationStatus: integration?.status ?? null,
    availableTools: {
      customers: hasTool(manifest, "customer.list_changes"),
      invoices: hasTool(manifest, "invoice.list_changes"),
      catalog: hasTool(manifest, "catalog.list_services"),
    },
    resources: states,
  };
}
