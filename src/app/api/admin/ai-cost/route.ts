import { handleApiError, jsonOk } from "@/lib/api/http";
import { getAdminAiCostReport } from "@/modules/ai-cost/report";
import { requirePlatformAdmin } from "@/modules/platform-admin/service";

export async function GET() {
  try {
    await requirePlatformAdmin();
    return jsonOk({
      periodDays: 30,
      currency: "USD",
      warning: "Estimated Standard Gemini prices; not invoiced totals. Unpriced requests, voice charges, tax and extra tools not included.",
      rows: await getAdminAiCostReport(),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
