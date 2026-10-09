import { handleApiError, jsonOk } from "@/lib/api/http";
import { getInboxConversationAiState } from "@/modules/ai/inbox-ai-service";
import { authenticateExternalIntegration } from "@/modules/integrations/service";
import { listInboxConversations, listInboxMessages } from "@/modules/messaging";

type Context = { params: Promise<{ conversationId: string }> };

function iso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

export async function GET(request: Request, context: Context) {
  try {
    const integration = await authenticateExternalIntegration(
      request.headers.get("authorization"),
    );
    const { conversationId } = await context.params;
    const url = new URL(request.url);
    const limitRaw = Number(url.searchParams.get("limit") ?? "150");
    const limit = Math.max(1, Math.min(300, Number.isFinite(limitRaw) ? limitRaw : 150));

    const [all, messages, state] = await Promise.all([
      listInboxConversations({ businessId: integration.businessId, limit: 200 }),
      listInboxMessages({
        businessId: integration.businessId,
        conversationId,
        limit,
      }),
      getInboxConversationAiState({
        businessId: integration.businessId,
        conversationId,
      }),
    ]);

    const head = all.find((item) => item.conversationId === conversationId);
    if (!head) {
      throw new Error("Conversation not found");
    }

    return jsonOk({
      conversation: {
        conversationId: head.conversationId,
        phone: head.contactPhoneNormalized ?? head.contactExternalKey,
        displayName: head.contactDisplayName,
        lastMessagePreview: head.lastMessagePreview,
        lastMessageAt: iso(head.lastMessageAtUtc) ?? new Date(0).toISOString(),
        aiMode: state.mode,
        aiPauseReason: state.pauseReason,
        pausedAtUtc: iso(state.pausedAtUtc),
        resumedAtUtc: iso(state.resumedAtUtc),
        messages: messages.map((message) => ({
          messageId: message.messageId,
          direction: message.direction === "OUTBOUND" ? "outbound" : "inbound",
          origin:
            message.direction === "OUTBOUND"
              ? "DRVOWA"
              : "CUSTOMER",
          text: message.textContent,
          occurredAt:
            iso(message.providerTimestampUtc)
            ?? iso(message.receivedAtUtc)
            ?? iso(message.createdAtUtc)
            ?? new Date(0).toISOString(),
          deliveryStatus: null,
        })),
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
