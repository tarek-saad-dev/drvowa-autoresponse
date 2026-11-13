import { requireApiBusiness } from "@/lib/api/auth-context";
import { handleApiError, jsonOk } from "@/lib/api/http";
import { listCampaignWhatsAppChannels } from "@/modules/crm/channel";
import { requireCrmMembership } from "@/modules/crm/service";

/** Lists WhatsApp channels for CRM campaign channel selection. */
export async function GET() {
  try {
    const { user, businessId } = await requireApiBusiness();
    await requireCrmMembership({ businessId, userId: user.userId });
    const channels = await listCampaignWhatsAppChannels({ businessId });
    const active = channels.filter((c) => c.isActive && c.status === "ACTIVE");
    return jsonOk({
      channels,
      activeChannels: active,
      requiresExplicitSelection: active.length !== 1,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
