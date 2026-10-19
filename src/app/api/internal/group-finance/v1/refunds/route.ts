import { listConfirmedRefundsForGroupFinance } from "@/modules/billing/group-finance-refunds";
import { financeExportResponse, financeExportUnauthorized } from "@/modules/billing/group-finance-export-http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Read-only, token-protected refund feed. The central consumer must opt in explicitly. */
export async function GET(request: Request) {
  const unauthorized = financeExportUnauthorized(request);
  if (unauthorized) return unauthorized;
  const url = new URL(request.url);
  try {
    return financeExportResponse(await listConfirmedRefundsForGroupFinance({
      from: url.searchParams.get("from"),
      after: url.searchParams.get("after"),
      limit: url.searchParams.get("limit"),
    }));
  } catch (error) {
    if (error instanceof RangeError) {
      return financeExportResponse({ error: "Invalid export pagination parameters" }, 400);
    }
    console.error("[group-finance] refund export failed", {
      name: error instanceof Error ? error.name : "unknown",
    });
    return financeExportResponse({ error: "Finance refund export unavailable" }, 503);
  }
}
