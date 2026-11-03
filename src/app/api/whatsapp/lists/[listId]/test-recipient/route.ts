import { z } from "zod";

import { requireApiBusiness } from "@/lib/api/auth-context";
import { handleApiError, jsonOk, parseJsonBody } from "@/lib/api/http";
import { assertRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { requireLabelCampaignOwner } from "@/modules/messaging/label-campaign-drafts";
import { checkDrvoListTestRecipient } from "@/modules/messaging/local-whatsapp-lists";

type Context = { params: Promise<{ listId: string }> };
const inputSchema = z.object({
  phone: z.string().trim().min(8).max(32),
}).strict();

/** Query only. No send, opt-in mutation, or permission fabrication. */
export async function POST(request: Request, context: Context) {
  try {
    const { businessId, user } = await requireApiBusiness();
    await requireLabelCampaignOwner({ businessId, userId: user.userId });
    assertRateLimit(
      "drvo-list-test:" + businessId,
      RATE_LIMITS.labelCampaignAction,
    );
    const { listId } = await context.params;
    const { phone } = inputSchema.parse(await parseJsonBody(request));
    const recipient = await checkDrvoListTestRecipient({
      businessId, listId, phone,
    });
    return jsonOk({ recipient, sent: false, updatedPermission: false });
  } catch (error) { return handleApiError(error); }
}
