import { handleApiError, jsonOk } from "@/lib/api/http";
import { getInboxConversationAiState } from "@/modules/ai/inbox-ai-service";
import { authenticateExternalIntegration } from "@/modules/integrations/service";
import { listInboxConversations } from "@/modules/messaging";

function serializeDate(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

export async function GET(request: Request) {
  try {
    const integration = await authenticateExternalIntegration(
      request.headers.get("authorization"),
    );
    const url = new URL(request.url);
    const limitRaw = Number(url.searchParams.get("limit") ?? "100");
    const limit = Math.max(1, Math.min(200, Number.isFinite(limitRaw) ? limitRaw : 100));

    const conversations = await listInboxConversations({
      businessId: integration.businessId,
      limit,
    });

    const items = await Promise.all(
      conversations.map(async (item) => {
        let aiMode = item.aiMode;
        let aiPauseReason = item.aiPauseReason;
        try {
          const state = await getInboxConversationAiState({
            businessId: integration.businessId,
            conversationId: item.conversationId,
          });
          aiMode = state.mode;
          aiPauseReason = state.pauseReason;
        } catch {
          // List should remain available even if state lookup fails for one row.
        }

        return {
          conversationId: item.conversationId,
          phone: item.contactPhoneNormalized ?? item.contactExternalKey,
          displayName: item.contactDisplayName,
          lastMessagePreview: item.lastMessagePreview,
          lastMessageAt: serializeDate(item.lastMessageAtUtc) ?? new Date(0).toISOString(),
          lastInboundAt: serializeDate(item.lastInboundAtUtc),
          lastOutboundAt: serializeDate(item.lastOutboundAtUtc),
          aiMode,
          aiPauseReason,
          aiReplyHealth: item.aiReplyHealth,
        };
      }),
    );

    return jsonOk({ items });
  } catch (error) {
    return handleApiError(error);
  }
}
