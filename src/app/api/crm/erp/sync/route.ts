import { requireApiBusiness } from "@/lib/api/auth-context";
import { handleApiError, jsonOk } from "@/lib/api/http";
import { assertRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { getErpSyncStatus, syncErpForBusiness } from "@/modules/crm/erp-sync";
import { requireCrmWriteAccess } from "@/modules/crm/service";

export async function GET() {
  try {
    const { user, businessId } = await requireApiBusiness();
    await requireCrmWriteAccess({ businessId, userId: user.userId });
    const status = await getErpSyncStatus({ businessId });
    return jsonOk({ status });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST() {
  try {
    const { user, businessId } = await requireApiBusiness();
    await requireCrmWriteAccess({ businessId, userId: user.userId });
    assertRateLimit("crm-erp-sync:" + businessId, RATE_LIMITS.labelCampaignPreflight);
    const result = await syncErpForBusiness({ businessId });
    const status = await getErpSyncStatus({ businessId });
    return jsonOk({ result, status });
  } catch (error) {
    return handleApiError(error);
  }
}
