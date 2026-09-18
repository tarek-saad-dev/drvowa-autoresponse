import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { DbError } from "@/lib/db";
import {
  AuthError,
  ForbiddenError,
  NotFoundError,
} from "@/lib/tenancy/errors";
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

  return jsonError("Request failed", 500);
}
