import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { parseErpAuditedInvoiceDeletionPage } from "../src/modules/crm/erp-sync";

const record = (auditId: number, invId: number) => ({
  auditId,
  invId,
  invType: "مبيعات",
  status: "cancelled",
  source: "audited_hard_delete",
});

describe("ERP audited hard-deleted sale invoice sync", () => {
  it("uses append-only AuditID independent from invoice IDs", () => {
    const result = parseErpAuditedInvoiceDeletionPage({
      deletions: [record(72, 9), record(75, 3)],
      nextCursor: { sinceAuditId: 75 },
      hasMore: true,
    }, 71);
    expect(result).toEqual({
      events: [
        { auditId: 72, externalInvId: "مبيعات:9" },
        { auditId: 75, externalInvId: "مبيعات:3" },
      ],
      nextAuditId: 75,
      hasMore: true,
    });
  });

  it("empty page retains the current cursor", () => {
    expect(parseErpAuditedInvoiceDeletionPage({
      deletions: [], nextCursor: { sinceAuditId: 88 }, hasMore: false,
    }, 88)).toEqual({ events: [], nextAuditId: 88, hasMore: false });
  });

  it("refuses wrong sale type, status, duplicates and non-monotonic audit IDs", () => {
    const badRows = [
      [record(8, 1), record(8, 2)],
      [record(6, 1)],
      [{ ...record(8, 1), invType: "مصروفات" }],
      [{ ...record(8, 1), status: "active" }],
      [record(8, 0)],
      [{ ...record(8, 1), invId: "1;DROP" }],
    ];
    for (const deletions of badRows) {
      expect(() => parseErpAuditedInvoiceDeletionPage(
        { deletions, nextCursor: { sinceAuditId: 8 } }, 7,
      )).toThrow();
    }
  });

  it("refuses malformed partial page before advancing a cursor", () => {
    for (const page of [
      null, { deletions: "bad" },
      { deletions: [record(10, 4)], nextCursor: { sinceAuditId: 8 } },
      { deletions: [record(10, 4)], nextCursor: { sinceAuditId: 11 } },
      { deletions: [], nextCursor: { sinceAuditId: 12 }, hasMore: true },
    ]) {
      expect(() => parseErpAuditedInvoiceDeletionPage(page, 9)).toThrow();
    }
  });

  it("keeps CRM deletion processing after append and sweep; persist cursor after mirror writes", () => {
    const src = readFileSync("src/modules/crm/erp-sync.ts", "utf8");
    const start = src.indexOf("async function syncInvoices(");
    const end = src.indexOf("async function syncCatalog(", start);
    const flow = src.slice(start, end);
    expect(flow.indexOf("// 1) Append-only stream")).toBeGreaterThan(0);
    expect(flow.indexOf("// 2) Rotating status sweep")).toBeGreaterThan(
      flow.indexOf("// 1) Append-only stream"),
    );
    expect(flow.indexOf('hasTool(params.manifest, "invoice.list_deletions")')).toBeGreaterThan(
      flow.indexOf("// 2) Rotating status sweep"),
    );
    const change = flow.indexOf("await repo.markErpInvoiceMirrorCancelled(");
    const save = flow.indexOf("await repo.upsertErpSyncState({", change);
    expect(change).toBeGreaterThan(0);
    expect(save).toBeGreaterThan(change);
    expect(flow).toContain("sinceAuditId: page.nextAuditId");
    expect(flow).toContain('throw new ValidationError("مؤشر حذف فواتير ERP غير صالح")');
  });

  it("mirror cancellation is BusinessID-scoped, idempotent and never deletes invoice/audit rows", () => {
    const src = readFileSync("src/modules/crm/repository.ts", "utf8");
    const start = src.indexOf("export async function markErpInvoiceMirrorCancelled(");
    const end = src.indexOf("export async function upsertErpServiceCatalog(",start);
    const body=src.slice(start,end);
    expect(start).toBeGreaterThan(0);
    expect(body).toContain("UPDATE dbo.TblErpInvoiceMirror");
    expect(body).toContain("WHERE BusinessID = @businessId AND ExternalInvId = @invId");
    expect(body).toContain("IsDeleted = 1");
    expect(body).toContain("IsValidSale = 0");
    expect(body).toContain("RawStatus = N'CANCELLED'");
    expect(body).not.toContain("DELETE FROM");
    expect(body).not.toContain("TblCashMove");
    expect(body).not.toContain("TblSensitiveActionAuditLog");
  });
});
