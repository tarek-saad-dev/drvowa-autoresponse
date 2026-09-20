import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { DbError } from "@/lib/db";
import { RateLimitError } from "@/lib/security/rate-limit";
import {
  AuthError,
  ForbiddenError,
  NotFoundError,
} from "@/lib/tenancy/errors";
import { isPlanEntitlementError } from "@/modules/billing/errors";
import { WhatsAppRuntimeError } from "@/modules/channels/runtime-client";

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
    return jsonError(error.message, 401);
  }
  if (error instanceof RateLimitError) {
    const res = jsonError(error.message, 429, {
      code: "RATE_LIMITED",
      retryAfterSec: error.retryAfterSec,
    });
    res.headers.set("Retry-After", String(error.retryAfterSec));
    return res;
  }
  if (isPlanEntitlementError(error)) {
    return jsonError(error.message, 403, { code: error.code });
  }
  if (error instanceof ForbiddenError) {
    return jsonError(error.message, 403);
  }
  if (error instanceof NotFoundError) {
    return jsonError(error.message, 404);
  }
  if (error instanceof ZodError) {
    const message = error.issues[0]?.message ?? "Validation failed";
    return jsonError(message, 400);
  }
  if (error instanceof DbError) {
    return jsonError(error.message || "Database unavailable", 503);
  }
  if (error instanceof WhatsAppRuntimeError) {
    return jsonError(error.message, error.status >= 400 ? error.status : 503, {
      code: error.code,
    });
  }

  console.error("[api]", {
    name: error instanceof Error ? error.name : "unknown",
    message: error instanceof Error ? error.message : "unknown",
  });
  return jsonError("Request failed", 500);
}
