import { describe, expect, it } from "vitest";

import { assertErpSyncRecorded } from "@/modules/crm/erp-sync-contract";

const result = {
  customers: { synced: 1, skipped: false },
  invoices: { synced: 2, skipped: false },
  catalog: { synced: 3, skipped: false },
};
const integrationId = "11111111-1111-4111-8111-111111111111";
const status = {
  integrationId,
  resources: (["customers", "invoices", "catalog"] as const).map((resource) => ({
    resource,
    integrationId,
    status: "SUCCESS" as const,
  })),
};

describe("CRM ERP sync success contract", () => {
  it("accepts a persisted, successful sync on the current integration", () => {
    expect(() => assertErpSyncRecorded(result, status)).not.toThrow();
  });
  it("accepts PARTIAL states for continued pagination, not a false success", () => {
    expect(() => assertErpSyncRecorded(result, {
      ...status,
      resources: status.resources.map((row) => ({ ...row, status: "PARTIAL" as const })),
    })).not.toThrow();
  });
  it("rejects a green no-op when there are no sync records", () => {
    expect(() => assertErpSyncRecorded(result, { integrationId, resources: [] }))
      .toThrow(/لم يتم تأكيد حفظ حالة مزامنة/);
  });
  it("rejects all-skipped resource processing", () => {
    expect(() => assertErpSyncRecorded({
      customers: { synced: 0, skipped: true },
      invoices: { synced: 0, skipped: true },
      catalog: { synced: 0, skipped: true },
    }, status)).toThrow(/customers/);
  });
  it("rejects historical states from an old integration", () => {
    expect(() => assertErpSyncRecorded(result, {
      ...status,
      resources: status.resources.map((row) => ({ ...row, integrationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" })),
    })).toThrow();
  });
  it("rejects any resource marked ERROR", () => {
    expect(() => assertErpSyncRecorded(result, {
      ...status,
      resources: status.resources.map((row) => row.resource === "invoices"
        ? { ...row, status: "ERROR" as const }
        : row),
    })).toThrow(/invoices/);
  });
});
