import { z } from "zod";

import { requireApiBusiness } from "@/lib/api/auth-context";
import { handleApiError, jsonError, jsonOk, parseJsonBody } from "@/lib/api/http";
import {
  RATE_LIMITS,
  assertRateLimit,
} from "@/lib/security/rate-limit";
import { mapUserFacingError } from "@/lib/ui/user-errors";
import { sendManualInboxReply } from "@/modules/inbox/manual-reply-service";
import { listInboxMessages } from "@/modules/messaging";

type RouteContext = {
  params: Promise<{ conversationId: string }>;
};

function parseBeforeCursor(url: URL): {
  at: Date;
  createdAtUtc: Date;
  messageId: string;
} | null {
  const beforeAt = url.searchParams.get("beforeAt");
  const beforeCreatedAt = url.searchParams.get("beforeCreatedAt");
  const beforeMessageId = url.searchParams.get("beforeMessageId");
  if (!beforeAt || !beforeCreatedAt || !beforeMessageId) return null;
  const at = new Date(beforeAt);
  const createdAtUtc = new Date(beforeCreatedAt);
  if (Number.isNaN(at.getTime()) || Number.isNaN(createdAtUtc.getTime())) {
    return null;
  }
  return { at, createdAtUtc, messageId: beforeMessageId };
}

const postBodySchema = z.object({
  text: z.string().min(1).max(4000),
  idempotencyKey: z.string().uuid(),
});

export async function GET(request: Request, context: RouteContext) {
  try {
    const { businessId } = await requireApiBusiness();
    const { conversationId } = await context.params;
    const url = new URL(request.url);
    const limitRaw = Number(url.searchParams.get("limit") ?? "100");
    const limit = Number.isFinite(limitRaw) ? limitRaw : 100;
    const before = parseBeforeCursor(url);
    const messages = await listInboxMessages({
      businessId,
      conversationId,
      limit,
      before,
    });
    return jsonOk({ conversationId, messages });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { businessId } = await requireApiBusiness();
    const { conversationId } = await context.params;
    assertRateLimit(`manual-send:${businessId}`, RATE_LIMITS.manualSend);
    const raw = await parseJsonBody(request);
    const body = postBodySchema.parse(raw);

    const result = await sendManualInboxReply({
      businessId,
      conversationId,
      text: body.text,
      idempotencyKey: body.idempotencyKey,
    });

    if (result.status === "FAILED") {
      return jsonError(
        mapUserFacingError(
          { code: result.errorCode, error: result.errorCode },
          "تعذر إرسال الرسالة.",
        ),
        403,
        { code: result.errorCode },
      );
    }
    if (result.status === "AMBIGUOUS") {
      return jsonOk(
        {
          conversationId,
          status: result.status,
          errorCode: result.errorCode,
          error: mapUserFacingError(
            { code: result.errorCode },
            "أُرسل الطلب لكن النتيجة غير مؤكدة. لا تعِد الإرسال تلقائياً — راجع المحادثة.",
          ),
        },
        { status: 202 },
      );
    }
    return jsonOk({
      conversationId,
      status: result.status,
      messageId: result.messageId,
      providerMessageId: result.providerMessageId,
      aiPaused: result.aiPaused,
    });
  } catch (error) {
    if (error instanceof Error) {
      if (
        error.message === "EMPTY_MESSAGE"
        || error.message === "MESSAGE_TOO_LONG"
        || error.message === "INVALID_IDEMPOTENCY_KEY"
      ) {
        return jsonError(
          mapUserFacingError({ code: error.message }),
          400,
          { code: error.message },
        );
      }
      if (
        error.message === "DESTINATION_UNAVAILABLE"
        || error.message === "ACCOUNT_KEY_MISSING"
      ) {
        return jsonError(
          mapUserFacingError({ code: error.message }),
          409,
          { code: error.message },
        );
      }
    }
    return handleApiError(error);
  }
}
