import { z } from "zod";

import { requireApiBusiness } from "@/lib/api/auth-context";
import { handleApiError, jsonOk, parseJsonBody } from "@/lib/api/http";
import { assertRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { freezeAudienceSnapshot } from "@/modules/crm/audience-service";

const schema = z
  .object({
    filter: z.unknown(),
    name: z.string().trim().min(2).max(160).nullable().optional(),
    segmentId: z.string().uuid().nullable().optional(),
    naturalLanguage: z.string().trim().max(2000).nullable().optional(),
  })
  .strict();

export async function POST(request: Request) {
  try {
    const { user, businessId } = await requireApiBusiness();
    assertRateLimit("crm-audience-freeze:" + businessId, RATE_LIMITS.labelCampaignPreflight);
    const input = schema.parse(await parseJsonBody(request));
    const result = await freezeAudienceSnapshot({
      businessId,
      userId: user.userId,
      filter: input.filter,
      name: input.name,
      segmentId: input.segmentId,
      naturalLanguage: input.naturalLanguage,
    });
    return jsonOk(result, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
