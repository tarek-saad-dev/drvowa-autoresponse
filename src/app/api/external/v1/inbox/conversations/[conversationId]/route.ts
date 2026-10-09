import { handleApiError, jsonOk } from "@/lib/api/http";
import { getInboxConversationAiState } from "@/modules/ai/inbox-ai-service";
import { authenticateExternalIntegration } from "@/modules/integrations/service";
import { listInboxConversations, listInboxMessages } from "@/modules/messaging";

type Context = { params: Promise<{ conversationId: string }> };

function iso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

function parseBeforeCursor(url: URL): {
  at: Date;
  createdAtUtc: Date;
  messageId: string;
} | null {
  const beforeAt = url.searchParams.get("beforeAt");
  const beforeCreatedAt = url.searchParams.get("beforeCreatedAt");
  const beforeMessageId = url.searchParams.get("beforeMessageId");
  if (!beforeAt || !beforeCreatedAt || !beforeMessageId) return null;
  const at = new Date(beforeAt);
  const createdAtUtc = new Date(beforeCreatedAt);
  if (Number.isNaN(at.getTime()) || Number.isNaN(createdAtUtc.getTime())) {
    return null;
  }
  return { at, createdAtUtc, messageId: beforeMessageId };
}

export async function GET(request: Request, context: Context) {
  try {
    const integration = await authenticateExternalIntegration(
      request.headers.get("authorization"),
    );
    const { conversationId } = await context.params;
    const url = new URL(request.url);
    const limitRaw = Number(url.searchParams.get("limit") ?? "150");
    const limit = Math.max(1, Math.min(200, Number.isFinite(limitRaw) ? limitRaw : 100));
    const before = parseBeforeCursor(url);

    const [all, messages, state] = await Promise.all([
      listInboxConversations({ businessId: integration.businessId, limit: 200 }),
      listInboxMessages({
        businessId: integration.businessId,
        conversationId,
        limit,
        before,
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
          origin: message.origin,
          actorName: message.actorName,
          actorUserId: message.actorUserId,
          text: message.textContent,
          occurredAt:
            iso(message.providerTimestampUtc)
            ?? iso(message.receivedAtUtc)
            ?? iso(message.createdAtUtc)
            ?? new Date(0).toISOString(),
          deliveryStatus: null,
          createdAtUtc: iso(message.createdAtUtc),
        })),
        pageInfo: {
          hasMore: messages.length === limit,
          nextCursor: messages.length > 0
            ? {
                beforeAt:
                  iso(messages[0]!.providerTimestampUtc)
                  ?? iso(messages[0]!.createdAtUtc),
                beforeCreatedAt: iso(messages[0]!.createdAtUtc),
                beforeMessageId: messages[0]!.messageId,
              }
            : null,
        },
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
