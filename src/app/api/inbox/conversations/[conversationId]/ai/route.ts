import { requireApiBusiness } from "@/lib/api/auth-context";
import { handleApiError, jsonOk } from "@/lib/api/http";
import {
  getInboxConversationAiState,
  pauseInboxConversationAi,
  resumeInboxConversationAi,
} from "@/modules/ai/inbox-ai-service";

type RouteContext = {
  params: Promise<{ conversationId: string }>;
};

function serializeState(state: Awaited<ReturnType<typeof getInboxConversationAiState>>) {
  return {
    conversationId: state.conversationId,
    mode: state.mode,
    pauseReason: state.pauseReason,
    pausedAtUtc: state.pausedAtUtc?.toISOString() ?? null,
    resumedAtUtc: state.resumedAtUtc?.toISOString() ?? null,
    lastHumanOutboundProviderMessageId:
      state.lastHumanOutboundProviderMessageId,
  };
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { businessId } = await requireApiBusiness();
    const { conversationId } = await context.params;
    const state = await getInboxConversationAiState({
      businessId,
      conversationId,
    });
    return jsonOk({ state: serializeState(state) });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { businessId } = await requireApiBusiness();
    const { conversationId } = await context.params;
    const url = new URL(request.url);
    // Support both /ai/resume and /ai with action in body for flexibility;
    // dedicated resume/pause routes are preferred.
    let action = url.searchParams.get("action");
    if (!action) {
      try {
        const body = (await request.json()) as { action?: string };
        action = body.action ?? "resume";
      } catch {
        action = "resume";
      }
    }

    if (action === "pause") {
      const state = await pauseInboxConversationAi({
        businessId,
        conversationId,
      });
      return jsonOk({ state: serializeState(state) });
    }

    const state = await resumeInboxConversationAi({
      businessId,
      conversationId,
    });
    return jsonOk({ state: serializeState(state) });
  } catch (error) {
    return handleApiError(error);
  }
}
