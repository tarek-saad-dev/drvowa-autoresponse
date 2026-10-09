import { handleApiError, jsonOk } from "@/lib/api/http";
import { resumeInboxConversationAi } from "@/modules/ai/inbox-ai-service";
import { authenticateExternalIntegration } from "@/modules/integrations/service";

type Context = { params: Promise<{ conversationId: string }> };

export async function POST(request: Request, context: Context) {
  try {
    const integration = await authenticateExternalIntegration(
      request.headers.get("authorization"),
    );
    const { conversationId } = await context.params;
    const state = await resumeInboxConversationAi({
      businessId: integration.businessId,
      conversationId,
    });
    return jsonOk({
      state: {
        conversationId: state.conversationId,
        mode: state.mode,
        pauseReason: state.pauseReason,
        resumedAtUtc: state.resumedAtUtc?.toISOString() ?? null,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
