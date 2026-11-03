import { z } from "zod";

import { requireApiBusiness } from "@/lib/api/auth-context";
import { handleApiError, jsonOk } from "@/lib/api/http";
import { getLabelCampaignAudiencePreview } from "@/modules/messaging/label-campaign-audience";
import { requireLabelCampaignOwner } from "@/modules/messaging/label-campaign-drafts";

type RouteContext = { params: Promise<{ draftId: string }> };

/** Read-only. Owner-only. Never returns full phone numbers or sendable recipients. */
export async function GET(_request: Request, context: RouteContext) {
  try {
    const { user, businessId } = await requireApiBusiness();
    await requireLabelCampaignOwner({ businessId, userId: user.userId });
    const { draftId } = await context.params;
    const safeId = z.string().uuid().parse(draftId);
    const audience = await getLabelCampaignAudiencePreview({ businessId, draftId: safeId });
    return jsonOk({ audience, sendingEnabled: false });
  } catch (error) {
    return handleApiError(error);
  }
}
