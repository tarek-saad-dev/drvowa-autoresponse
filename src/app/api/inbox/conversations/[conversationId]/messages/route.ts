import { requireApiBusiness } from "@/lib/api/auth-context";
import { handleApiError, jsonOk } from "@/lib/api/http";
import { listInboxMessages } from "@/modules/messaging";

type RouteContext = {
  params: Promise<{ conversationId: string }>;
};

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

export async function GET(request: Request, context: RouteContext) {
  try {
    const { businessId } = await requireApiBusiness();
    const { conversationId } = await context.params;
    const url = new URL(request.url);
    const limitRaw = Number(url.searchParams.get("limit") ?? "100");
    const limit = Number.isFinite(limitRaw) ? limitRaw : 100;
    const before = parseBeforeCursor(url);
    const messages = await listInboxMessages({
      businessId,
      conversationId,
      limit,
      before,
    });
    return jsonOk({ conversationId, messages });
  } catch (error) {
    return handleApiError(error);
  }
}
