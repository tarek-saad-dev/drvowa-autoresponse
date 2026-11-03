import { z } from "zod";

import { requireApiBusiness } from "@/lib/api/auth-context";
import { handleApiError, jsonOk } from "@/lib/api/http";
import { assertRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { requireLabelCampaignOwner } from "@/modules/messaging/label-campaign-drafts";
import {
  createLabelCampaignPreflight, listLabelCampaignPreflights,
} from "@/modules/messaging/label-campaign-preflight";

type RouteContext = { params: Promise<{ draftId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { businessId, user } = await requireApiBusiness();
    await requireLabelCampaignOwner({ businessId, userId: user.userId });
    const draftId = z.string().uuid().parse((await context.params).draftId);
    const preflights = await listLabelCampaignPreflights({ businessId, draftId });
    return jsonOk({ preflights, sendingEnabled: false });
  } catch (error) {
    return handleApiError(error);
  }
}

/** Idempotent review-only snapshot, NEVER a command to deliver WhatsApp messages. */
export async function POST(_request: Request, context: RouteContext) {
  try {
    const { businessId, user } = await requireApiBusiness();
    await requireLabelCampaignOwner({ businessId, userId: user.userId });
    assertRateLimit(
      `label-campaign-preflight:${businessId}`,
      RATE_LIMITS.labelCampaignPreflight,
    );
    const draftId = z.string().uuid().parse((await context.params).draftId);
    const preflight = await createLabelCampaignPreflight({
      businessId, draftId, userId: user.userId,
    });
    return jsonOk({ preflight, sendingEnabled: false }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
