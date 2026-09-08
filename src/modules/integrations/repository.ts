import { randomUUID } from "node:crypto";

import { query, sql } from "@/lib/db";
import { normalizeUuid } from "@/lib/ids/uuid";
import type { Integration, IntegrationStatus } from "@/types/domain";

export const INTEGRATION_TYPE_DRVO_ERP = "DRVO_ERP" as const;

type IntegrationRow = {
  IntegrationID: string;
  BusinessID: string;
  Type: string;
  Status: string;
  ExternalReference: string | null;
  ConfigJson: string | null;
  CreatedAtUtc: Date;
  UpdatedAtUtc: Date;
};

function mapIntegration(row: IntegrationRow): Integration {
  return {
    integrationId: normalizeUuid(row.IntegrationID),
    businessId: normalizeUuid(row.BusinessID),
    type: row.Type,
    status: row.Status as IntegrationStatus,
    externalReference: row.ExternalReference,
    configJson: row.ConfigJson,
    createdAtUtc: row.CreatedAtUtc,
    updatedAtUtc: row.UpdatedAtUtc,
  };
}

/** Reject secret-like keys from non-secret ConfigJson. */
export function sanitizeIntegrationConfig(
  config: Record<string, unknown> | null | undefined,
): string | null {
  if (!config) {
    return null;
  }

  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(config)) {
    const normalized = key.toLowerCase().replace(/[^a-z]/g, "");
    if (
      normalized.includes("password") ||
      normalized.includes("token") ||
      normalized.includes("secret") ||
      normalized.includes("authorization") ||
      normalized.includes("apikey") ||
      normalized.includes("credential")
    ) {
      continue;
    }
    cleaned[key] = value;
  }

  return Object.keys(cleaned).length > 0 ? JSON.stringify(cleaned) : null;
}

export async function listIntegrations(params: {
  businessId: string;
}): Promise<Integration[]> {
  const result = await query<IntegrationRow>(
    `SELECT IntegrationID, BusinessID, Type, Status, ExternalReference, ConfigJson,
            CreatedAtUtc, UpdatedAtUtc
     FROM TblIntegration
     WHERE BusinessID = @businessId
     ORDER BY Type`,
    [
      {
        name: "businessId",
        type: sql.UniqueIdentifier,
        value: params.businessId,
      },
    ],
  );
  return result.recordset.map(mapIntegration);
}

export async function getIntegrationByType(params: {
  businessId: string;
  type: string;
}): Promise<Integration | null> {
  const result = await query<IntegrationRow>(
    `SELECT IntegrationID, BusinessID, Type, Status, ExternalReference, ConfigJson,
            CreatedAtUtc, UpdatedAtUtc
     FROM TblIntegration
     WHERE BusinessID = @businessId AND Type = @type`,
    [
      {
        name: "businessId",
        type: sql.UniqueIdentifier,
        value: params.businessId,
      },
      { name: "type", type: sql.NVarChar(64), value: params.type },
    ],
  );
  const row = result.recordset[0];
  return row ? mapIntegration(row) : null;
}

export async function upsertIntegration(params: {
  businessId: string;
  type: string;
  status?: IntegrationStatus;
  externalReference?: string | null;
  config?: Record<string, unknown> | null;
}): Promise<Integration> {
  const existing = await getIntegrationByType({
    businessId: params.businessId,
    type: params.type,
  });
  const now = new Date();
  const status = params.status ?? "INACTIVE";
  const configJson = sanitizeIntegrationConfig(params.config);
  const externalReference =
    params.externalReference === undefined
      ? (existing?.externalReference ?? null)
      : params.externalReference;

  if (existing) {
    await query(
      `UPDATE TblIntegration
       SET Status = @status,
           ExternalReference = @externalReference,
           ConfigJson = @configJson,
           UpdatedAtUtc = @updatedAtUtc
       WHERE BusinessID = @businessId AND IntegrationID = @integrationId`,
      [
        {
          name: "businessId",
          type: sql.UniqueIdentifier,
          value: params.businessId,
        },
        {
          name: "integrationId",
          type: sql.UniqueIdentifier,
          value: existing.integrationId,
        },
        { name: "status", type: sql.NVarChar(32), value: status },
        {
          name: "externalReference",
          type: sql.NVarChar(256),
          value: externalReference,
        },
        {
          name: "configJson",
          type: sql.NVarChar(sql.MAX),
          value: configJson,
        },
        { name: "updatedAtUtc", type: sql.DateTime2, value: now },
      ],
    );

    return {
      ...existing,
      status,
      externalReference,
      configJson,
      updatedAtUtc: now,
    };
  }

  const integrationId = randomUUID();
  await query(
    `INSERT INTO TblIntegration (
      IntegrationID, BusinessID, Type, Status, ExternalReference, ConfigJson,
      CreatedAtUtc, UpdatedAtUtc
    ) VALUES (
      @integrationId, @businessId, @type, @status, @externalReference, @configJson,
      @createdAtUtc, @updatedAtUtc
    )`,
    [
      {
        name: "integrationId",
        type: sql.UniqueIdentifier,
        value: integrationId,
      },
      {
        name: "businessId",
        type: sql.UniqueIdentifier,
        value: params.businessId,
      },
      { name: "type", type: sql.NVarChar(64), value: params.type },
      { name: "status", type: sql.NVarChar(32), value: status },
      {
        name: "externalReference",
        type: sql.NVarChar(256),
        value: externalReference,
      },
      {
        name: "configJson",
        type: sql.NVarChar(sql.MAX),
        value: configJson,
      },
      { name: "createdAtUtc", type: sql.DateTime2, value: now },
      { name: "updatedAtUtc", type: sql.DateTime2, value: now },
    ],
  );

  return {
    integrationId,
    businessId: params.businessId,
    type: params.type,
    status,
    externalReference,
    configJson,
    createdAtUtc: now,
    updatedAtUtc: now,
  };
}
