import { randomUUID } from "node:crypto";

import { NotFoundError, ValidationError } from "@/lib/tenancy/errors";
import { callIntegrationTool, fetchIntegrationManifest } from "@/modules/integrations/connector-client";
import {
  getIntegrationByType,
  INTEGRATION_TYPE_DRVO_ERP,
} from "@/modules/integrations/repository";
import { getCrmErpMirrorCounts } from "./repository";

export type ErpSourceCounts = {
  customers: number;
  invoices: number;
  catalog: number;
  asOfUtc: string;
};

function safeCount(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new ValidationError("عدد سجلات المصدر غير صالح؛ لم يتم حساب نسبة تخمينية.");
  }
  return value;
}

/**
 * Read-only source snapshot, scoped to the owner's existing integration.
 * The new Cashier sync.source_counts tool counts all source IDs, even
 * cancelled invoices and soft-deleted services, so CRM mirror counts can
 * be compared on the exact same logical population.
 */
export async function readErpSourceProgress(params: { businessId: string }) {
  const integration = await getIntegrationByType({
    businessId: params.businessId,
    type: INTEGRATION_TYPE_DRVO_ERP,
  });
  if (!integration || integration.status !== "ACTIVE") {
    throw new NotFoundError("ربط Cashier غير مفعّل");
  }
  const manifest = await fetchIntegrationManifest(integration);
  if (!manifest.tools.some((tool) => tool.name === "sync.source_counts" && tool.mode === "READ")) {
    throw new ValidationError(
      "تحديث عداد إجمالي Cashier غير منشور بعد. هنعرض العدد الموجود في CRM بدون نسبة غير دقيقة.",
    );
  }
  const result = await callIntegrationTool({
    integration,
    tool: "sync.source_counts",
    input: {},
    requestId: randomUUID(),
  });
  if (!result.ok || !result.data || typeof result.data !== "object") {
    throw new ValidationError("تعذر قراءة إجمالي بيانات Cashier؛ لم يتم حساب نسبة.");
  }
  const data = result.data as Record<string, unknown>;
  const asOfUtc = typeof data.asOfUtc === "string" ? data.asOfUtc : "";
  if (!Number.isFinite(Date.parse(asOfUtc))) {
    throw new ValidationError("وقت قياس بيانات Cashier غير صالح.");
  }
  const sourceCounts: ErpSourceCounts = {
    customers: safeCount(data.customers),
    invoices: safeCount(data.invoices),
    catalog: safeCount(data.catalog),
    asOfUtc,
  };
  const mirrored = await getCrmErpMirrorCounts({ businessId: params.businessId });
  return {
    sourceCounts,
    mirrored: {
      customers: mirrored.erpCustomers,
      invoices: mirrored.allInvoiceHeaders,
      catalog: mirrored.allCatalogItems,
    },
  };
}
