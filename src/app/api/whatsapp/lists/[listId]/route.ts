import { requireApiBusiness } from "@/lib/api/auth-context";
import { handleApiError, jsonOk } from "@/lib/api/http";
import { assertRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { requireLabelCampaignOwner } from "@/modules/messaging/label-campaign-drafts";
import { deleteDrvoList } from "@/modules/messaging/local-whatsapp-lists";

type Context = { params: Promise<{ listId: string }> };

export async function DELETE(_request: Request, context: Context) {
  try {
    const { user, businessId } = await requireApiBusiness();
    await requireLabelCampaignOwner({ businessId, userId: user.userId });
    assertRateLimit("drvo-lists-delete:" + businessId, RATE_LIMITS.labelCampaignAction);
    await deleteDrvoList({ businessId, listId: (await context.params).listId });
    return jsonOk({ deleted: true });
  } catch (error) { return handleApiError(error); }
}
