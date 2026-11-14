import { requireApiBusiness } from "@/lib/api/auth-context";
import { handleApiError, jsonOk } from "@/lib/api/http";
import { assertRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { readErpSourceProgress } from "@/modules/crm/erp-source-counts";
import { requireCrmWriteAccess } from "@/modules/crm/service";

/** Signed-in CRM admin only. Live aggregate source counts, no customer PII,
 * source mutations, CRM writes or WhatsApp sends.
 */
export async function POST() {
  try {
    const { user, businessId } = await requireApiBusiness();
    await requireCrmWriteAccess({ businessId, userId: user.userId });
    assertRateLimit("crm-erp-progress:" + businessId, RATE_LIMITS.crmErpProgressCounts);
    return jsonOk({ progress: await readErpSourceProgress({ businessId }) });
  } catch (error) {
    return handleApiError(error);
  }
}
