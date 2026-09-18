import {
  assertInboundBodySize,
  requireRuntimeBearer,
} from "@/lib/api/runtime-auth";
import {
  handleApiError,
  jsonOk,
  parseJsonBody,
} from "@/lib/api/http";
import {
  inboundWhatsAppDtoSchema,
  ingestWhatsAppInbound,
} from "@/modules/messaging";

/**
 * S2S ingest: WhatsApp runtime → DRVOWA.
 * Authenticated by DRVOWA_RUNTIME_TOKEN only — not browser sessions.
 */
export async function POST(request: Request) {
  try {
    requireRuntimeBearer(request.headers.get("authorization"));
    assertInboundBodySize(request);

    const body = await parseJsonBody(request);
    const dto = inboundWhatsAppDtoSchema.parse(body);
    const result = await ingestWhatsAppInbound(dto);

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
      messageId: result.messageId,
      conversationId: result.conversationId,
      contactId: result.contactId,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
