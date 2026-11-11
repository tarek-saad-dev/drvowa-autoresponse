import { z } from "zod";

import { requireApiBusiness } from "@/lib/api/auth-context";
import { handleApiError, jsonOk, parseJsonBody } from "@/lib/api/http";
import { assertRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { listSegments, saveSegment } from "@/modules/crm/audience-service";

const saveSchema = z
  .object({
    segmentId: z.string().uuid().nullable().optional(),
    name: z.string().trim().min(2).max(160),
    description: z.string().trim().max(1000).nullable().optional(),
    filter: z.unknown(),
  })
  .strict();

export async function GET() {
  try {
    const { user, businessId } = await requireApiBusiness();
    const segments = await listSegments({
      businessId,
      userId: user.userId,
    });
    return jsonOk({ segments });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const { user, businessId } = await requireApiBusiness();
    assertRateLimit("crm-segments-save:" + businessId, RATE_LIMITS.labelCampaignDraft);
    const input = saveSchema.parse(await parseJsonBody(request));
    const segment = await saveSegment({
      businessId,
      userId: user.userId,
      segmentId: input.segmentId,
      name: input.name,
      description: input.description,
      filter: input.filter,
    });
    return jsonOk({ segment }, { status: input.segmentId ? 200 : 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
