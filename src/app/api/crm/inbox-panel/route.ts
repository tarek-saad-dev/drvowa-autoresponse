import { z } from "zod";

import { requireApiBusiness } from "@/lib/api/auth-context";
import { handleApiError, jsonOk } from "@/lib/api/http";
import { getInboxCrmPanel } from "@/modules/crm/service";

const querySchema = z
  .object({
    conversationId: z.string().uuid(),
  })
  .strict();

export async function GET(request: Request) {
  try {
    const { user, businessId } = await requireApiBusiness();
    const url = new URL(request.url);
    const { conversationId } = querySchema.parse({
      conversationId: url.searchParams.get("conversationId") ?? undefined,
    });
    const panel = await getInboxCrmPanel({
      businessId,
      userId: user.userId,
      conversationId,
    });
    return jsonOk({ panel });
  } catch (error) {
    return handleApiError(error);
  }
}
