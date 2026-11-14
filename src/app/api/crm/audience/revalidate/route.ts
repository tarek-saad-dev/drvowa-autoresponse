import { z } from "zod";

import { requireApiBusiness } from "@/lib/api/auth-context";
import { handleApiError, jsonOk, parseJsonBody } from "@/lib/api/http";
import { assertRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { revalidateSnapshotEligibility } from "@/modules/crm/audience-service";
import { requireCrmWriteAccess } from "@/modules/crm/service";

const schema = z
  .object({
    snapshotId: z.string().uuid(),
    channelConnectionId: z.string().uuid().nullable().optional(),
  })
  .strict();

/** Revalidates frozen snapshot eligibility for an explicit WhatsApp channel. */
export async function POST(request: Request) {
  try {
    const { user, businessId } = await requireApiBusiness();
    await requireCrmWriteAccess({ businessId, userId: user.userId });
    assertRateLimit("crm-audience-revalidate:" + businessId, RATE_LIMITS.labelCampaignAction);
    const input = schema.parse(await parseJsonBody(request));
    const result = await revalidateSnapshotEligibility({
      businessId,
      snapshotId: input.snapshotId,
      channelConnectionId: input.channelConnectionId,
    });
    return jsonOk(result);
  } catch (error) {
    return handleApiError(error);
  }
}
