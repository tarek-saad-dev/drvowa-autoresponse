import { z } from "zod";

import { requireApiBusiness } from "@/lib/api/auth-context";
import { handleApiError, jsonOk, parseJsonBody } from "@/lib/api/http";
import { NotFoundError } from "@/lib/tenancy/errors";
import {
  getConversationForBusiness,
  markConversationRead,
} from "@/modules/messaging/repository";

type Context = { params: Promise<{ conversationId: string }> };

const readSchema = z.object({
  upTo: z.iso.datetime({ offset: true }).optional(),
});

export async function POST(request: Request, context: Context) {
  try {
    const { businessId } = await requireApiBusiness();
    const { conversationId } = await context.params;
    const conversation = await getConversationForBusiness({ businessId, conversationId });
    if (!conversation) throw new NotFoundError("Conversation not found");
    const raw = await parseJsonBody(request);
    const { upTo } = readSchema.parse(raw);
    const at = upTo ? new Date(upTo) : new Date();
    // Never acknowledge future messages that might arrive after this request.
    if (at.getTime() > Date.now()) {
      return jsonOk({ ok: false, reason: "INVALID_READ_WATERMARK" }, { status: 400 });
    }
    await markConversationRead({ businessId, conversationId, at });
    return jsonOk({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
