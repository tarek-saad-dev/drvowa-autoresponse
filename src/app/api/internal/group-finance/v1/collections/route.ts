import {
  listApprovedCollectionsForGroupFinance,
} from "@/modules/billing/group-finance-collections";
import {
  financeExportResponse,
  financeExportUnauthorized,
} from "@/modules/billing/group-finance-export-http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Stable keyset feed; group ingestion MUST deduplicate using
 * (productId, sourceEntity, sourceEntityId, sourceVersion).
 */
export async function GET(request: Request) {
  const unauthorized = financeExportUnauthorized(request);
  if (unauthorized) return unauthorized;

  const url = new URL(request.url);
  try {
    const page = await listApprovedCollectionsForGroupFinance({
      from: url.searchParams.get("from"),
      after: url.searchParams.get("after"),
      limit: url.searchParams.get("limit"),
    });
    return financeExportResponse(page);
  } catch (error) {
    if (error instanceof RangeError) {
      return financeExportResponse({ error: "Invalid export pagination parameters" }, 400);
    }
    console.error("[group-finance] collection export failed", {
      name: error instanceof Error ? error.name : "unknown",
    });
    return financeExportResponse({ error: "Finance export unavailable" }, 503);
  }
}
