import { handleApiError, jsonOk } from "@/lib/api/http";
import { getAdminOverviewCounts } from "@/modules/billing/manual-payment-service";
import { requirePlatformAdmin } from "@/modules/platform-admin/service";

export async function GET() {
  try {
    await requirePlatformAdmin();
    const overview = await getAdminOverviewCounts();
    return jsonOk(overview);
  } catch (error) {
    return handleApiError(error);
  }
}
