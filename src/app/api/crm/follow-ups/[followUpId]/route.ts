import { z } from "zod";

import { requireApiBusiness } from "@/lib/api/auth-context";
import { handleApiError, jsonOk, parseJsonBody } from "@/lib/api/http";
import { assertRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { updateFollowUp } from "@/modules/crm/service";

type RouteContext = { params: Promise<{ followUpId: string }> };

const patchSchema = z
  .object({
    title: z.string().trim().min(2).max(200).optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    dueAtUtc: z.string().datetime().nullable().optional(),
    priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
    status: z.enum(["OPEN", "IN_PROGRESS", "COMPLETED", "CANCELLED"]).optional(),
    assignedUserId: z.string().uuid().nullable().optional(),
  })
  .strict();

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { user, businessId } = await requireApiBusiness();
    assertRateLimit("crm-followups-update:" + businessId, RATE_LIMITS.labelCampaignAction);
    const { followUpId } = await context.params;
    const safeId = z.string().uuid().parse(followUpId);
    const input = patchSchema.parse(await parseJsonBody(request));
    const followUp = await updateFollowUp({
      businessId,
      userId: user.userId,
      followUpId: safeId,
      ...input,
    });
    return jsonOk({ followUp });
  } catch (error) {
    return handleApiError(error);
  }
}
