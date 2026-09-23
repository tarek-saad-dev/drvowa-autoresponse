import { z } from "zod";

import { requireApiBusiness } from "@/lib/api/auth-context";
import { handleApiError, jsonOk, parseJsonBody } from "@/lib/api/http";
import { applyKnowledgeIngest } from "@/modules/knowledge-ai";

const applySchema = z.object({
  sessionId: z.string().uuid(),
  proposalIds: z.array(z.string().uuid()).max(200).optional(),
});

export async function POST(request: Request) {
  try {
    const { user, businessId } = await requireApiBusiness();
    const body = await parseJsonBody(request);
    const input = applySchema.parse(body);
    const result = await applyKnowledgeIngest({
      businessId,
      userId: user.userId,
      sessionId: input.sessionId,
      proposalIds: input.proposalIds,
    });
    return jsonOk(result);
  } catch (error) {
    return handleApiError(error);
  }
}
