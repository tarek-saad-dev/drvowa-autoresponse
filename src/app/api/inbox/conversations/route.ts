import { requireApiBusiness } from "@/lib/api/auth-context";
import { handleApiError, jsonError, jsonOk } from "@/lib/api/http";
import {
  getInboxConversationCounts,
  listInboxConversations,
} from "@/modules/messaging";
import type { ConversationFilter } from "@/modules/messaging/repository";

const MAX_PAGE_SIZE = 100;

export async function GET(request: Request) {
  try {
    const { businessId } = await requireApiBusiness();
    const url = new URL(request.url);
    const limitRaw = Number(url.searchParams.get("limit") ?? "60");
    const pageSize = Number.isFinite(limitRaw)
      ? Math.min(Math.max(Math.trunc(limitRaw), 1), MAX_PAGE_SIZE)
      : 60;
    const search = (url.searchParams.get("search") ?? "").trim().slice(0, 96);
    const filterRaw = url.searchParams.get("filter") ?? "ALL";
    if (!["ALL", "UNREAD", "HUMAN", "AUTO", "ARCHIVED", "PINNED"].includes(filterRaw)) {
      return jsonError("Invalid conversation filter", 400);
    }
    const filter = filterRaw as ConversationFilter;
    const beforeAt = url.searchParams.get("beforeAt");
    const beforeId = url.searchParams.get("beforeId");
    let before: { at: Date; conversationId: string } | null = null;
    if (beforeAt || beforeId) {
      if (
        !beforeAt || !beforeId
        || Number.isNaN(new Date(beforeAt).getTime())
        || !/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(beforeId)
      ) {
        return jsonError("Invalid conversation cursor", 400);
      }
      before = { at: new Date(beforeAt), conversationId: beforeId };
    }

    const [batch, counts] = await Promise.all([
      listInboxConversations({
        businessId, limit: pageSize + 1, before, search, filter,
      }),
      getInboxConversationCounts({ businessId }),
    ]);
    const conversations = batch.slice(0, pageSize);
    const hasMore = batch.length > pageSize;
    const last = conversations.at(-1);
    return jsonOk({
      conversations,
      counts,
      hasMore,
      nextCursor: hasMore && last ? {
        beforeAt: (last.lastMessageAtUtc ?? last.createdAtUtc).toISOString(),
        beforeId: last.conversationId,
      } : null,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
