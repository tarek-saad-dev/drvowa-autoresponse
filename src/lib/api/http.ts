import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { DbError } from "@/lib/db";
import { RateLimitError } from "@/lib/security/rate-limit";
import {
  AuthError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@/lib/tenancy/errors";
import {
  isPlanEntitlementError,
  type PlanErrorCode,
} from "@/modules/billing/errors";
import { WhatsAppRuntimeError } from "@/modules/channels/runtime-client";
import { KnowledgeIngestError } from "@/modules/knowledge-ai/analyze-service";
import { mapUserFacingError } from "@/lib/ui/user-errors";

export function jsonOk<T>(
  data: T,
  init?: { status?: number },
): NextResponse {
  return NextResponse.json(data, { status: init?.status ?? 200 });
}

export function jsonError(
  message: string,
  status: number,
  extra?: Record<string, unknown>,
): NextResponse {
  return NextResponse.json({ error: message, ...extra }, { status });
}

export async function parseJsonBody(request: Request): Promise<unknown> {
  const contentLength = request.headers.get("content-length");
  if (contentLength) {
    const size = Number(contentLength);
    if (Number.isFinite(size) && size > 256_000) {
      throw new ZodError([
        {
          code: "custom",
          path: [],
          message: "Request body too large",
        },
      ]);
    }
  }
  try {
    return await request.json();
  } catch {
    throw new ZodError([
      {
        code: "custom",
        path: [],
        message: "Invalid JSON body",
      },
    ]);
  }
}

/**
 * Maps known domain/validation errors to safe JSON responses.
 * Never exposes stack traces or database internals.
 */
export function handleApiError(error: unknown): NextResponse {
  if (error instanceof AuthError) {
    return jsonError(
      mapUserFacingError(
        { error: error.message },
        "انتهت الجلسة. سجّل الدخول من جديد.",
      ),
      401,
    );
  }
  if (error instanceof RateLimitError) {
    const res = jsonError(
      mapUserFacingError({ code: "RATE_LIMITED", error: error.message }),
      429,
      {
        code: "RATE_LIMITED",
        retryAfterSec: error.retryAfterSec,
      },
    );
    res.headers.set("Retry-After", String(error.retryAfterSec));
    return res;
  }
  if (isPlanEntitlementError(error)) {
    const code = error.code as PlanErrorCode;
    return jsonError(
      mapUserFacingError({ code, error: error.message }),
      403,
      { code },
    );
  }
  if (error instanceof ForbiddenError) {
    return jsonError(
      mapUserFacingError({ error: error.message }, "لا تملك صلاحية تنفيذ هذا الإجراء."),
      403,
    );
  }
  if (error instanceof ValidationError) {
    return jsonError(
      mapUserFacingError({ error: error.message }, "تحقق من البيانات المدخلة."),
      400,
    );
  }
  if (error instanceof ConflictError) {
    return jsonError(
      mapUserFacingError({ error: error.message }, "تعذر إكمال العملية بسبب تعارض."),
      409,
    );
  }
  if (error instanceof NotFoundError) {
    return jsonError(
      mapUserFacingError({ error: error.message }, "العنصر غير موجود أو لم يعد متاحاً."),
      404,
    );
  }
  if (error instanceof KnowledgeIngestError) {
    return jsonError(
      mapUserFacingError(
        { code: error.code, error: error.message },
        error.message,
      ),
      error.statusCode,
      { code: error.code },
    );
  }
  if (error instanceof ZodError) {
    const message = error.issues[0]?.message ?? "Validation failed";
    return jsonError(
      mapUserFacingError({ error: message }, "تحقق من الحقول المدخلة ثم أعد المحاولة."),
      400,
    );
  }
  if (error instanceof DbError) {
    return jsonError(
      mapUserFacingError(
        { error: error.message },
        "الخدمة غير متاحة مؤقتاً. حاول مرة أخرى بعد قليل.",
      ),
      503,
    );
  }
  if (error instanceof WhatsAppRuntimeError) {
    return jsonError(
      mapUserFacingError(
        { code: error.code, error: error.message },
        "تعذر الاتصال بواتساب. حاول مرة أخرى.",
      ),
      error.status >= 400 ? error.status : 503,
      { code: error.code },
    );
  }

  console.error("[api]", {
    name: error instanceof Error ? error.name : "unknown",
    message: error instanceof Error ? error.message : "unknown",
  });
  return jsonError("تعذر إتمام الطلب. حاول مرة أخرى.", 500);
}
