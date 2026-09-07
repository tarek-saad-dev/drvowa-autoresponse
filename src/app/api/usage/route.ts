import { requireApiBusiness } from "@/lib/api/auth-context";
import { handleApiError, jsonOk } from "@/lib/api/http";
import { listUsageEvents } from "@/modules/usage/service";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const queryBusinessId = url.searchParams.get("businessId");
    const limitRaw = url.searchParams.get("limit");
    const limit = limitRaw ? Number(limitRaw) : undefined;
    const { businessId } = await requireApiBusiness({
      businessId: queryBusinessId,
    });
    const events = await listUsageEvents({
      businessId,
      limit:
        limit !== undefined && Number.isFinite(limit) && limit > 0
          ? Math.min(limit, 200)
          : undefined,
    });
    return jsonOk({ events });
  } catch (error) {
    return handleApiError(error);
  }
}
