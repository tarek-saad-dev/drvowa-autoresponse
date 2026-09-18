import { requireApiBusiness } from "@/lib/api/auth-context";
import { handleApiError, jsonOk } from "@/lib/api/http";
import { listInboxConversations } from "@/modules/messaging";

export async function GET(request: Request) {
  try {
    const { businessId } = await requireApiBusiness();
    const url = new URL(request.url);
    const limitRaw = Number(url.searchParams.get("limit") ?? "50");
    const limit = Number.isFinite(limitRaw) ? limitRaw : 50;
    const conversations = await listInboxConversations({ businessId, limit });
    return jsonOk({ conversations });
  } catch (error) {
    return handleApiError(error);
  }
}
