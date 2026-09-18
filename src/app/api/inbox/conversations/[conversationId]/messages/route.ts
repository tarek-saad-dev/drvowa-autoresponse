import { requireApiBusiness } from "@/lib/api/auth-context";
import { handleApiError, jsonOk } from "@/lib/api/http";
import { listInboxMessages } from "@/modules/messaging";

type RouteContext = {
  params: Promise<{ conversationId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  try {
    const { businessId } = await requireApiBusiness();
    const { conversationId } = await context.params;
    const url = new URL(request.url);
    const limitRaw = Number(url.searchParams.get("limit") ?? "100");
    const limit = Number.isFinite(limitRaw) ? limitRaw : 100;
    const messages = await listInboxMessages({
      businessId,
      conversationId,
      limit,
    });
    return jsonOk({ conversationId, messages });
  } catch (error) {
    return handleApiError(error);
  }
}
