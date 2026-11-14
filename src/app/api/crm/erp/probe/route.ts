import { requireApiBusiness } from "@/lib/api/auth-context";
import { handleApiError, jsonOk } from "@/lib/api/http";
import { assertRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { probeCrmErpSource } from "@/modules/crm/erp-source-probe";
import { requireCrmWriteAccess } from "@/modules/crm/service";

/**
 * Live connector diagnostic, NO CRM writes:
 * calls only the three allowlisted ERP READ tools with limit=1.
 * The response contains counts and categorical errors, never source records.
 */
export async function POST() {
  try {
    const { user, businessId } = await requireApiBusiness();
    await requireCrmWriteAccess({ businessId, userId: user.userId });
    assertRateLimit("crm-erp-probe:" + businessId, RATE_LIMITS.labelCampaignPreflight);
    return jsonOk({ probe: await probeCrmErpSource({ businessId }) });
  } catch (error) {
    return handleApiError(error);
  }
}
