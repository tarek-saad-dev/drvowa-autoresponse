import { requireApiBusiness } from "@/lib/api/auth-context";
import { handleApiError, jsonOk } from "@/lib/api/http";
import { getSubscription } from "@/modules/billing/service";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const queryBusinessId = url.searchParams.get("businessId");
    const { businessId } = await requireApiBusiness({
      businessId: queryBusinessId,
    });
    const subscription = await getSubscription({ businessId });
    return jsonOk({ subscription });
  } catch (error) {
    return handleApiError(error);
  }
}
