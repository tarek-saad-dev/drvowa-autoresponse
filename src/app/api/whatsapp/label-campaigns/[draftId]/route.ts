import { z } from "zod";

import { requireApiBusiness } from "@/lib/api/auth-context";
import { handleApiError, jsonOk, parseJsonBody } from "@/lib/api/http";
import { assertRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import {
  requireLabelCampaignOwner, updateLabelCampaignDraft,
} from "@/modules/messaging/label-campaign-drafts";

const changeSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("update"), messageText: z.string().trim().min(4).max(3000) }).strict(),
  z.object({ action: z.literal("approve_copy"), messageText: z.string().trim().min(4).max(3000) }).strict(),
  z.object({ action: z.literal("cancel") }).strict(),
]);
type RouteContext = { params: Promise<{ draftId: string }> };

/** Approval means reviewed COPY ONLY; no execution, scheduling or outbound API. */
export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { user, businessId } = await requireApiBusiness();
    await requireLabelCampaignOwner({ businessId, userId: user.userId });
    assertRateLimit(`label-campaign-action:${businessId}`, RATE_LIMITS.labelCampaignAction);
    const { draftId } = await context.params;
    const safeId = z.string().uuid().parse(draftId);
    const input = changeSchema.parse(await parseJsonBody(request));
    const draft = await updateLabelCampaignDraft({
      businessId, draftId: safeId,
      action: input.action,
      messageText: "messageText" in input ? input.messageText : undefined,
    });
    return jsonOk({ draft, sendingEnabled: false });
  } catch (error) {
    return handleApiError(error);
  }
}
