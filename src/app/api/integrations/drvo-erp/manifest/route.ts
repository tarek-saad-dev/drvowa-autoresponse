import { requireApiBusiness } from "@/lib/api/auth-context";
import { handleApiError, jsonOk } from "@/lib/api/http";
import { refreshDrvoErpManifest } from "@/modules/integrations/service";

export async function POST() {
  try {
    const { businessId } = await requireApiBusiness();
    const manifest = await refreshDrvoErpManifest({ businessId });
    return jsonOk({ manifest });
  } catch (error) {
    return handleApiError(error);
  }
}
