import { requireApiBusiness } from "@/lib/api/auth-context";
import { handleApiError, jsonOk } from "@/lib/api/http";
import { pauseInboxConversationAi } from "@/modules/ai/inbox-ai-service";

type RouteContext = {
  params: Promise<{ conversationId: string }>;
};

/**
 * Optional manual pause — Mode = HUMAN_PAUSED, PauseReason = MANUAL_PAUSE.
 */
export async function POST(_request: Request, context: RouteContext) {
  try {
    const { businessId } = await requireApiBusiness();
    const { conversationId } = await context.params;
    const state = await pauseInboxConversationAi({
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
