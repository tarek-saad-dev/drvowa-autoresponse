import { timingSafeEqual } from "node:crypto";

import { ZodError } from "zod";

import { AuthError } from "@/lib/tenancy/errors";

/**
 * Server-only S2S bearer auth for WhatsApp runtime → DRVOWA ingest.
 * Never expose DRVOWA_RUNTIME_TOKEN to the browser.
 */
export function requireRuntimeBearer(authorizationHeader: string | null): void {
  const expected = process.env.DRVOWA_RUNTIME_TOKEN?.trim();
  if (!expected) {
    throw new AuthError("Runtime token is not configured");
  }

  if (
    typeof authorizationHeader !== "string"
    || !authorizationHeader.startsWith("Bearer ")
  ) {
    throw new AuthError("Missing or invalid Authorization bearer token");
  }

  const provided = authorizationHeader.slice("Bearer ".length).trim();
  if (!provided) {
    throw new AuthError("Missing or invalid Authorization bearer token");
  }

  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new AuthError("Invalid Authorization bearer token");
  }
}

/** Reject oversized ingest bodies early (bytes). */
export const RUNTIME_INBOUND_MAX_BODY_BYTES = 65_536;

function bodyTooLargeError(): ZodError {
  return new ZodError([
    {
      code: "custom",
      path: [],
      message: "Request body too large",
    },
  ]);
}

function invalidJsonError(): ZodError {
  return new ZodError([
    {
      code: "custom",
      path: [],
      message: "Invalid JSON body",
    },
  ]);
}

/** Fast-path reject when Content-Length is present and over limit. */
export function assertInboundBodySize(request: Request): void {
  const raw = request.headers.get("content-length");
  if (!raw) return;
  const length = Number(raw);
  if (Number.isFinite(length) && length > RUNTIME_INBOUND_MAX_BODY_BYTES) {
    throw bodyTooLargeError();
  }
}

/**
 * Byte-bounded JSON parse for runtime ingest.
 * Enforces RUNTIME_INBOUND_MAX_BODY_BYTES even when Content-Length is absent
 * (chunked / streamed bodies). Never logs body contents.
 */
export async function parseBoundedRuntimeJsonBody(
  request: Request,
  maxBytes: number = RUNTIME_INBOUND_MAX_BODY_BYTES,
): Promise<unknown> {
  assertInboundBodySize(request);

  if (!request.body) {
    throw invalidJsonError();
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value || value.byteLength === 0) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        try {
          await reader.cancel();
        } catch {
          // ignore cancel failures; size rejection is authoritative
        }
        throw bodyTooLargeError();
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof ZodError) throw error;
    throw invalidJsonError();
  }

  const buffer = Buffer.concat(chunks.map((c) => Buffer.from(c)));
  if (buffer.byteLength === 0) {
    throw invalidJsonError();
  }

  let text: string;
  try {
    text = buffer.toString("utf8");
  } catch {
    throw invalidJsonError();
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw invalidJsonError();
  }
}
