import { handleApiError, jsonOk } from "@/lib/api/http";
import {
  authenticateExternalIntegration,
  refreshExternalIntegrationManifest,
} from "@/modules/integrations/service";

export async function POST(request: Request) {
  try {
    const integration = await authenticateExternalIntegration(
      request.headers.get("authorization"),
    );
    const manifest = await refreshExternalIntegrationManifest({ integration });
    return jsonOk({
      ok: true,
      manifest,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
