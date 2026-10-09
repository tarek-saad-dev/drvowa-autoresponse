import { randomUUID } from "node:crypto";
import { z } from "zod";

import { handleApiError, jsonError, jsonOk, parseJsonBody } from "@/lib/api/http";
import { mapUserFacingError } from "@/lib/ui/user-errors";
import { authenticateExternalIntegration } from "@/modules/integrations/service";
import { sendManualInboxReply } from "@/modules/inbox/manual-reply-service";

type Context = { params: Promise<{ conversationId: string }> };

const schema = z.object({
  text: z.string().min(1).max(4000),
  idempotencyKey: z.string().uuid().optional(),
});

export async function POST(request: Request, context: Context) {
  try {
    const integration = await authenticateExternalIntegration(
      request.headers.get("authorization"),
    );
    const { conversationId } = await context.params;
    const body = schema.parse(await parseJsonBody(request));

    const result = await sendManualInboxReply({
      businessId: integration.businessId,
      conversationId,
      text: body.text,
      idempotencyKey: body.idempotencyKey ?? randomUUID(),
    });

    if (result.status === "FAILED") {
      return jsonError(
        mapUserFacingError({ code: result.errorCode }, "تعذر إرسال الرسالة."),
        409,
        { code: result.errorCode },
      );
    }

    return jsonOk(result, {
      status: result.status === "AMBIGUOUS" ? 202 : 200,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
