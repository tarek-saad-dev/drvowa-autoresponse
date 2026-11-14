import { ConflictError } from "@/lib/tenancy/errors";

export type ResourceName = "customers" | "invoices" | "catalog";
export type ErpSyncResultContract = Record<ResourceName, { synced: number; skipped: boolean }>;
export type ErpSyncStatusContract = {
  integrationId: string | null;
  resources: Array<{
    resource: string;
    integrationId: string;
    status: "IDLE" | "RUNNING" | "PARTIAL" | "SUCCESS" | "ERROR";
  }>;
};

const RESOURCES: ResourceName[] = ["customers", "invoices", "catalog"];

/**
 * An HTTP 200 must never claim success when all resource syncs are skipped,
 * or the ERP sync rows were not persisted/visible in SQL.
 */
export function assertErpSyncRecorded(
  result: ErpSyncResultContract,
  status: ErpSyncStatusContract,
): void {
  const missing = RESOURCES.filter((name) => {
    const item = status.resources.find((row) =>
      row.resource === name && row.integrationId === status.integrationId
    );
    return result[name].skipped || !item || item.status === "IDLE" || item.status === "ERROR";
  });
  if (missing.length > 0) {
    throw new ConflictError(
      "لم يتم تأكيد حفظ حالة مزامنة " + missing.join("، ") +
      " رغم انتهاء الطلب. لا تعتبر العملية ناجحة؛ اختبر مصدر Cashier وراجع إعداد التكامل.",
    );
  }
}
