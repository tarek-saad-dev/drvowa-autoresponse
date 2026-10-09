import { handleApiError, jsonOk } from "@/lib/api/http";
import { authenticateExternalIntegration } from "@/modules/integrations/service";
import { markConversationRead } from "@/modules/messaging/repository";

type Context = { params: Promise<{ conversationId: string }> };

export async function POST(request: Request, context: Context) {
  try {
    const integration = await authenticateExternalIntegration(
      request.headers.get("authorization"),
    );
    const { conversationId } = await context.params;

    await markConversationRead({
      businessId: integration.businessId,
      conversationId,
    });

    return jsonOk({ ok: true, conversationId });
  } catch (error) {
    return handleApiError(error);
  }
}
