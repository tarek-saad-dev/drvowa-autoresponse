import { z } from "zod";

import { requireApiBusiness } from "@/lib/api/auth-context";
import { handleApiError, jsonOk, parseJsonBody } from "@/lib/api/http";
import { assertRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { requireLabelCampaignOwner } from "@/modules/messaging/label-campaign-drafts";
import { createDrvoList } from "@/modules/messaging/local-whatsapp-lists";

const schema = z.object({ name: z.string().trim().min(2).max(80) }).strict();

/** Creates an internal DRVO audience, not a remote WhatsApp Business label. */
export async function POST(request: Request) {
  try {
    const { user, businessId } = await requireApiBusiness();
    await requireLabelCampaignOwner({ businessId, userId: user.userId });
    assertRateLimit("drvo-lists-create:" + businessId, RATE_LIMITS.labelCampaignDraft);
    const input = schema.parse(await parseJsonBody(request));
    const list = await createDrvoList({ businessId, name: input.name });
    return jsonOk({ list, source: "DRVO", remoteWhatsAppLabel: false }, { status: 201 });
  } catch (error) { return handleApiError(error); }
}
