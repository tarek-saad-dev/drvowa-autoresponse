import { getAdminFinancialReport } from "@/modules/billing/admin-financial-report";
import { toProductFinancialSnapshot } from "@/modules/billing/group-finance-contract";
import {
  financeExportResponse,
  financeExportUnauthorized,
} from "@/modules/billing/group-finance-export-http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Read-only service-to-service endpoint, not customer or browser login. */
export async function GET(request: Request) {
  const unauthorized = financeExportUnauthorized(request);
  if (unauthorized) return unauthorized;

  try {
    const report = await getAdminFinancialReport({ months: 12 });
    return financeExportResponse(toProductFinancialSnapshot(report));
  } catch (error) {
    console.error("[group-finance] snapshot export failed", {
      name: error instanceof Error ? error.name : "unknown",
    });
    return financeExportResponse({ error: "Finance export unavailable" }, 503);
  }
}
