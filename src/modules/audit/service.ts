import { randomUUID } from "node:crypto";

import { query, sql, type TransactionClient } from "@/lib/db";
import { normalizeNullableUuid } from "@/lib/ids/uuid";
import type { AuditEvent } from "@/types/domain";

const FORBIDDEN_METADATA_KEYS = new Set([
  "password",
  "token",
  "secret",
  "authorization",
  "passwordhash",
  "accesstoken",
  "refreshtoken",
]);

function isForbiddenKey(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[^a-z]/g, "");
  if (FORBIDDEN_METADATA_KEYS.has(normalized)) {
    return true;
  }
  return (
    normalized.includes("password") ||
    normalized.includes("token") ||
    normalized.includes("secret") ||
    normalized.includes("authorization")
  );
}

export function sanitizeAuditMetadata(
  metadata: Record<string, unknown> | undefined,
): Record<string, unknown> | null {
  if (!metadata) {
    return null;
  }

  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (isForbiddenKey(key)) {
      continue;
    }
    cleaned[key] = value;
  }
  return Object.keys(cleaned).length > 0 ? cleaned : null;
}

function db(trx?: TransactionClient) {
  return { query: trx?.query.bind(trx) ?? query };
}

/**
 * Persist an audit event. When `trx` is provided, the INSERT participates in
 * the caller's transaction (required for billing approval/rejection/submit).
 *
 * Test hook: set DRVOWA_TEST_AUDIT_FAIL=1 to force failure (integration tests).
 */
export async function writeAuditEvent(
  params: {
    businessId?: string | null;
    actorUserId?: string | null;
    action: string;
    entityType: string;
    entityId?: string | null;
    metadata?: Record<string, unknown>;
  },
  trx?: TransactionClient,
): Promise<AuditEvent> {
  if (process.env.DRVOWA_TEST_AUDIT_FAIL === "1") {
    throw new Error("forced audit failure");
  }

  const auditEventId = randomUUID();
  const occurredAtUtc = new Date();
  const safeMetadata = sanitizeAuditMetadata(params.metadata);
  const metadataJson = safeMetadata ? JSON.stringify(safeMetadata) : null;

  await db(trx).query(
    `INSERT INTO TblAuditEvent (
      AuditEventID, BusinessID, ActorUserID, Action, EntityType, EntityID,
      OccurredAtUtc, MetadataJson
    ) VALUES (
      @auditEventId, @businessId, @actorUserId, @action, @entityType, @entityId,
      @occurredAtUtc, @metadataJson
    )`,
    [
      {
        name: "auditEventId",
        type: sql.UniqueIdentifier,
        value: auditEventId,
      },
      {
        name: "businessId",
        type: sql.UniqueIdentifier,
        value: params.businessId ?? null,
      },
      {
        name: "actorUserId",
        type: sql.UniqueIdentifier,
        value: params.actorUserId ?? null,
      },
      { name: "action", type: sql.NVarChar(128), value: params.action },
      {
        name: "entityType",
        type: sql.NVarChar(128),
        value: params.entityType,
      },
      {
        name: "entityId",
        type: sql.UniqueIdentifier,
        value: params.entityId ?? null,
      },
      { name: "occurredAtUtc", type: sql.DateTime2, value: occurredAtUtc },
      {
        name: "metadataJson",
        type: sql.NVarChar(sql.MAX),
        value: metadataJson,
      },
    ],
  );

  return {
    auditEventId,
    businessId: normalizeNullableUuid(params.businessId ?? null),
    actorUserId: normalizeNullableUuid(params.actorUserId ?? null),
    action: params.action,
    entityType: params.entityType,
    entityId: normalizeNullableUuid(params.entityId ?? null),
    occurredAtUtc,
    metadataJson,
  };
}
