import {
  parseBoundedRuntimeJsonBody,
  requireRuntimeBearer,
} from "@/lib/api/runtime-auth";
import { handleApiError, jsonOk } from "@/lib/api/http";
import {
  ingestWhatsAppOutboundObserved,
  outboundObservedDtoSchema,
} from "@/modules/ai/observation-service";

/**
 * S2S: WhatsApp runtime → DRVOWA outbound observation.
 * Authenticated by DRVOWA_RUNTIME_TOKEN only — not browser sessions.
 * BusinessID is resolved server-side from accountKey.
 */
export async function POST(request: Request) {
  try {
    requireRuntimeBearer(request.headers.get("authorization"));
    const body = await parseBoundedRuntimeJsonBody(request);
    const dto = outboundObservedDtoSchema.parse(body);
    const result = await ingestWhatsAppOutboundObserved(dto);

    if (result.outcome === "ignored") {
      return jsonOk({
        success: true,
        outcome: result.outcome,
        reason: result.reason,
      });
    }

    return jsonOk({
      success: true,
      outcome: result.outcome,
      origin: result.origin,
      observationId: result.observationId,
      conversationId: result.conversationId,
      ...(result.outcome === "accepted" ? { paused: result.paused } : {}),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
