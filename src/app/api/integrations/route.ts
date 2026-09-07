import { requireApiBusiness } from "@/lib/api/auth-context";
import { handleApiError, jsonOk } from "@/lib/api/http";
import { listIntegrations } from "@/modules/integrations/service";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const queryBusinessId = url.searchParams.get("businessId");
    const { businessId } = await requireApiBusiness({
      businessId: queryBusinessId,
    });
    const integrations = await listIntegrations({ businessId });
    return jsonOk({ integrations });
  } catch (error) {
    return handleApiError(error);
  }
}
