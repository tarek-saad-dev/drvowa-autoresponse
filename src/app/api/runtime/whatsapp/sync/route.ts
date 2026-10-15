import { requireRuntimeBearer, parseBoundedRuntimeJsonBody } from "@/lib/api/runtime-auth";
import { handleApiError, jsonOk } from "@/lib/api/http";
import { ingestWhatsAppSync, whatsappSyncSchema } from "@/modules/messaging/whatsapp-sync-service";

export async function POST(request: Request) {
  try {
    requireRuntimeBearer(request.headers.get("authorization"));
    const payload = whatsappSyncSchema.parse(await parseBoundedRuntimeJsonBody(request));
    const result = await ingestWhatsAppSync(payload);
    return jsonOk(result);
  } catch (error) {
    return handleApiError(error);
  }
}
