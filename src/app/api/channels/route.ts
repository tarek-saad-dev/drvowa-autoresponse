import { requireApiBusiness } from "@/lib/api/auth-context";
import { handleApiError, jsonOk } from "@/lib/api/http";
import { listConnections } from "@/modules/channels/service";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const queryBusinessId = url.searchParams.get("businessId");
    const { businessId } = await requireApiBusiness({
      businessId: queryBusinessId,
    });
    const channels = await listConnections({ businessId });
    return jsonOk({ channels });
  } catch (error) {
    return handleApiError(error);
  }
}
