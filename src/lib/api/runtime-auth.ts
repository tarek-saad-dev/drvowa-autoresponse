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

export function assertInboundBodySize(request: Request): void {
  const raw = request.headers.get("content-length");
  if (!raw) return;
  const length = Number(raw);
  if (Number.isFinite(length) && length > RUNTIME_INBOUND_MAX_BODY_BYTES) {
    throw new ZodError([
      {
        code: "custom",
        path: [],
        message: "Request body too large",
      },
    ]);
  }
}
