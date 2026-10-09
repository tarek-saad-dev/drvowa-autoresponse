import { handleApiError, jsonOk } from "@/lib/api/http";
import { pauseInboxConversationAi } from "@/modules/ai/inbox-ai-service";
import { authenticateExternalIntegration } from "@/modules/integrations/service";

type Context = { params: Promise<{ conversationId: string }> };

export async function POST(request: Request, context: Context) {
  try {
    const integration = await authenticateExternalIntegration(
      request.headers.get("authorization"),
    );
    const { conversationId } = await context.params;
    const state = await pauseInboxConversationAi({
      businessId: integration.businessId,
      conversationId,
    });
    return jsonOk({
      state: {
        conversationId: state.conversationId,
        mode: state.mode,
        pauseReason: state.pauseReason,
        pausedAtUtc: state.pausedAtUtc?.toISOString() ?? null,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
