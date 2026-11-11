import { z } from "zod";

import { requireApiBusiness } from "@/lib/api/auth-context";
import { handleApiError, jsonOk, parseJsonBody } from "@/lib/api/http";
import { assertRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { previewAudience } from "@/modules/crm/audience-service";

const schema = z
  .object({
    filter: z.unknown(),
    naturalLanguage: z.string().trim().max(2000).nullable().optional(),
    previewLimit: z.number().int().min(1).max(200).optional(),
  })
  .strict();

export async function POST(request: Request) {
  try {
    const { user, businessId } = await requireApiBusiness();
    assertRateLimit("crm-audience-preview:" + businessId, RATE_LIMITS.labelCampaignPreflight);
    const input = schema.parse(await parseJsonBody(request));
    const preview = await previewAudience({
      businessId,
      userId: user.userId,
      filter: input.filter,
      naturalLanguage: input.naturalLanguage,
      previewLimit: input.previewLimit,
    });
    return jsonOk({ preview });
  } catch (error) {
    return handleApiError(error);
  }
}
