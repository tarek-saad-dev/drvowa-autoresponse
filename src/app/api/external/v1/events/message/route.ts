import { z } from "zod";

import { handleApiError, jsonOk, parseJsonBody } from "@/lib/api/http";
import {
  authenticateExternalIntegration,
  deliverExternalEventMessage,
} from "@/modules/integrations/service";

const schema = z.object({
  eventId: z.string().min(1).max(200),
  event: z.string().min(1).max(128),
  recipient: z.string().min(6).max(64),
  message: z.string().min(1).max(4000),
  metadata: z.record(z.string(), z.unknown()).nullish(),
});

export async function POST(request: Request) {
  try {
    const integration = await authenticateExternalIntegration(
      request.headers.get("authorization"),
    );
    const body = schema.parse(await parseJsonBody(request));
    const result = await deliverExternalEventMessage({
      integration,
      externalEventId: body.eventId,
      eventType: body.event,
      recipient: body.recipient,
      message: body.message,
      metadata: body.metadata ?? null,
    });
    return jsonOk({
      ok: true,
      eventId: body.eventId,
      status: result.status,
      providerMessageId: result.providerMessageId,
      idempotentReplay: result.replay,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
