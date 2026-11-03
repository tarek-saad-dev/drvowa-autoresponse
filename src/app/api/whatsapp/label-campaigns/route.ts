import { z } from "zod";

import { requireApiBusiness } from "@/lib/api/auth-context";
import { handleApiError, jsonOk, parseJsonBody } from "@/lib/api/http";
import { assertRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import {
  createLabelCampaignDrafts, createLabelCampaignDraftFromSelection, listLabelCampaignDrafts,
  requireLabelCampaignOwner,
} from "@/modules/messaging/label-campaign-drafts";

const commandSchema = z.union([
  z.object({ text: z.string().trim().min(12).max(4000) }).strict(),
  z.object({
    channelConnectionId: z.string().uuid(),
    labelId: z.string().trim().min(1).max(128),
    messageText: z.string().trim().min(4).max(3000),
  }).strict(),
]);

/** The owner-only command is NEVER exposed through the public WhatsApp inbound path. */
export async function POST(request: Request) {
  try {
    const { user, businessId } = await requireApiBusiness();
    await requireLabelCampaignOwner({ businessId, userId: user.userId });
    assertRateLimit(`label-campaign-draft:${businessId}`, RATE_LIMITS.labelCampaignDraft);
    const input = commandSchema.parse(await parseJsonBody(request));
    const drafts = "text" in input
      ? await createLabelCampaignDrafts({
          businessId, userId: user.userId, text: input.text,
        })
      : [await createLabelCampaignDraftFromSelection({
          businessId, userId: user.userId,
          channelConnectionId: input.channelConnectionId,
          labelId: input.labelId, messageText: input.messageText,
        })];
    return jsonOk({ drafts, sendingEnabled: false }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function GET() {
  try {
    const { user, businessId } = await requireApiBusiness();
    await requireLabelCampaignOwner({ businessId, userId: user.userId });
    const drafts = await listLabelCampaignDrafts(businessId);
    return jsonOk({
      drafts, sendingEnabled: false, syncCoverage: "EVENT_DRIVEN_PARTIAL",
    });
  } catch (error) {
    return handleApiError(error);
  }
}
