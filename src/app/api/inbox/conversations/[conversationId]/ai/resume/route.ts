import { requireApiBusiness } from "@/lib/api/auth-context";
import { handleApiError, jsonOk } from "@/lib/api/http";
import { resumeInboxConversationAi } from "@/modules/ai/inbox-ai-service";

type RouteContext = {
  params: Promise<{ conversationId: string }>;
};

/**
 * Tenant-authenticated Resume AI for a conversation.
 * BusinessID comes from auth only — never from the body.
 */
export async function POST(_request: Request, context: RouteContext) {
  try {
    const { businessId } = await requireApiBusiness();
    const { conversationId } = await context.params;
    const state = await resumeInboxConversationAi({
      businessId,
      conversationId,
    });
    return jsonOk({
      state: {
        conversationId: state.conversationId,
        mode: state.mode,
        pauseReason: state.pauseReason,
        pausedAtUtc: state.pausedAtUtc?.toISOString() ?? null,
        resumedAtUtc: state.resumedAtUtc?.toISOString() ?? null,
        lastHumanOutboundProviderMessageId:
          state.lastHumanOutboundProviderMessageId,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
