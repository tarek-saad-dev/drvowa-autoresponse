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
  BaseUrl: string | null;
  InboundApiKeyHash: string | null;
  SecretCiphertext: string | null;
  CapabilitiesJson: string | null;
  LastHealthAtUtc: Date | null;
  LastHealthStatus: string | null;
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
    baseUrl: row.BaseUrl,
    inboundApiKeyHash: row.InboundApiKeyHash,
    secretCiphertext: row.SecretCiphertext,
    capabilitiesJson: row.CapabilitiesJson,
    lastHealthAtUtc: row.LastHealthAtUtc,
    lastHealthStatus: row.LastHealthStatus,
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
            BaseUrl, InboundApiKeyHash, SecretCiphertext, CapabilitiesJson,
            LastHealthAtUtc, LastHealthStatus, CreatedAtUtc, UpdatedAtUtc
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
            BaseUrl, InboundApiKeyHash, SecretCiphertext, CapabilitiesJson,
            LastHealthAtUtc, LastHealthStatus, CreatedAtUtc, UpdatedAtUtc
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


export async function getIntegrationByInboundApiKeyHash(params: {
  apiKeyHash: string;
}): Promise<Integration | null> {
  const result = await query<IntegrationRow>(
    `SELECT IntegrationID, BusinessID, Type, Status, ExternalReference, ConfigJson,
            BaseUrl, InboundApiKeyHash, SecretCiphertext, CapabilitiesJson,
            LastHealthAtUtc, LastHealthStatus, CreatedAtUtc, UpdatedAtUtc
     FROM TblIntegration
     WHERE InboundApiKeyHash = @apiKeyHash`,
    [
      {
        name: "apiKeyHash",
        type: sql.NVarChar(128),
        value: params.apiKeyHash,
      },
    ],
  );
  const row = result.recordset[0];
  return row ? mapIntegration(row) : null;
}

export async function configureIntegrationConnector(params: {
  businessId: string;
  integrationId: string;
  baseUrl: string;
  inboundApiKeyHash: string;
  secretCiphertext: string;
  capabilitiesJson?: string | null;
  status?: IntegrationStatus;
}): Promise<Integration | null> {
  await query(
    `UPDATE TblIntegration
     SET BaseUrl = @baseUrl,
         InboundApiKeyHash = @inboundApiKeyHash,
         SecretCiphertext = @secretCiphertext,
         CapabilitiesJson = @capabilitiesJson,
         Status = @status,
         UpdatedAtUtc = SYSUTCDATETIME()
     WHERE BusinessID = @businessId AND IntegrationID = @integrationId`,
    [
      { name: "businessId", type: sql.UniqueIdentifier, value: params.businessId },
      { name: "integrationId", type: sql.UniqueIdentifier, value: params.integrationId },
      { name: "baseUrl", type: sql.NVarChar(500), value: params.baseUrl },
      { name: "inboundApiKeyHash", type: sql.NVarChar(128), value: params.inboundApiKeyHash },
      { name: "secretCiphertext", type: sql.NVarChar(sql.MAX), value: params.secretCiphertext },
      { name: "capabilitiesJson", type: sql.NVarChar(sql.MAX), value: params.capabilitiesJson ?? null },
      { name: "status", type: sql.NVarChar(32), value: params.status ?? "ACTIVE" },
    ],
  );
  const result = await query<IntegrationRow>(
    `SELECT IntegrationID, BusinessID, Type, Status, ExternalReference, ConfigJson,
            BaseUrl, InboundApiKeyHash, SecretCiphertext, CapabilitiesJson,
            LastHealthAtUtc, LastHealthStatus, CreatedAtUtc, UpdatedAtUtc
     FROM TblIntegration
     WHERE BusinessID = @businessId AND IntegrationID = @integrationId`,
    [
      { name: "businessId", type: sql.UniqueIdentifier, value: params.businessId },
      { name: "integrationId", type: sql.UniqueIdentifier, value: params.integrationId },
    ],
  );
  const row = result.recordset[0];
  return row ? mapIntegration(row) : null;
}

export async function updateIntegrationHealth(params: {
  businessId: string;
  integrationId: string;
  status: "HEALTHY" | "ERROR";
  capabilitiesJson?: string | null;
}): Promise<void> {
  await query(
    `UPDATE TblIntegration
     SET LastHealthAtUtc = SYSUTCDATETIME(),
         LastHealthStatus = @lastHealthStatus,
         CapabilitiesJson = COALESCE(@capabilitiesJson, CapabilitiesJson),
         Status = CASE WHEN @lastHealthStatus = N'HEALTHY' THEN N'ACTIVE' ELSE Status END,
         UpdatedAtUtc = SYSUTCDATETIME()
     WHERE BusinessID = @businessId AND IntegrationID = @integrationId`,
    [
      { name: "businessId", type: sql.UniqueIdentifier, value: params.businessId },
      { name: "integrationId", type: sql.UniqueIdentifier, value: params.integrationId },
      { name: "lastHealthStatus", type: sql.NVarChar(32), value: params.status },
      { name: "capabilitiesJson", type: sql.NVarChar(sql.MAX), value: params.capabilitiesJson ?? null },
    ],
  );
}

type EventLogRow = {
  IntegrationEventLogID: string;
  Status: string;
  ProviderMessageID: string | null;
  ErrorCode: string | null;
};

export async function claimIntegrationEvent(params: {
  businessId: string;
  integrationId: string;
  externalEventId: string;
  eventType: string;
  recipient: string;
  messagePreview: string | null;
  metadataJson: string | null;
}): Promise<{
  eventLogId: string;
  status: string;
  providerMessageId: string | null;
  errorCode: string | null;
  replay: boolean;
}> {
  try {
    const eventLogId = randomUUID();
    await query(
      `INSERT INTO TblIntegrationEventLog (
        IntegrationEventLogID, BusinessID, IntegrationID, ExternalEventID,
        EventType, Recipient, MessagePreview, Status, MetadataJson,
        CreatedAtUtc, UpdatedAtUtc
      ) VALUES (
        @eventLogId, @businessId, @integrationId, @externalEventId,
        @eventType, @recipient, @messagePreview, N'RECEIVED', @metadataJson,
        SYSUTCDATETIME(), SYSUTCDATETIME()
      )`,
      [
        { name: "eventLogId", type: sql.UniqueIdentifier, value: eventLogId },
        { name: "businessId", type: sql.UniqueIdentifier, value: params.businessId },
        { name: "integrationId", type: sql.UniqueIdentifier, value: params.integrationId },
        { name: "externalEventId", type: sql.NVarChar(200), value: params.externalEventId },
        { name: "eventType", type: sql.NVarChar(128), value: params.eventType },
        { name: "recipient", type: sql.NVarChar(64), value: params.recipient },
        { name: "messagePreview", type: sql.NVarChar(300), value: params.messagePreview },
        { name: "metadataJson", type: sql.NVarChar(sql.MAX), value: params.metadataJson },
      ],
    );
    return {
      eventLogId,
      status: "RECEIVED",
      providerMessageId: null,
      errorCode: null,
      replay: false,
    };
  } catch (error) {
    const existing = await query<EventLogRow>(
      `SELECT IntegrationEventLogID, Status, ProviderMessageID, ErrorCode
       FROM TblIntegrationEventLog
       WHERE IntegrationID = @integrationId AND ExternalEventID = @externalEventId`,
      [
        { name: "integrationId", type: sql.UniqueIdentifier, value: params.integrationId },
        { name: "externalEventId", type: sql.NVarChar(200), value: params.externalEventId },
      ],
    );
    const row = existing.recordset[0];
    if (!row) throw error;
    return {
      eventLogId: normalizeUuid(row.IntegrationEventLogID),
      status: row.Status,
      providerMessageId: row.ProviderMessageID,
      errorCode: row.ErrorCode,
      replay: true,
    };
  }
}

export async function completeIntegrationEvent(params: {
  eventLogId: string;
  status: "SENT" | "FAILED";
  providerMessageId?: string | null;
  errorCode?: string | null;
}): Promise<void> {
  await query(
    `UPDATE TblIntegrationEventLog
     SET Status = @status,
         ProviderMessageID = @providerMessageId,
         ErrorCode = @errorCode,
         UpdatedAtUtc = SYSUTCDATETIME()
     WHERE IntegrationEventLogID = @eventLogId`,
    [
      { name: "eventLogId", type: sql.UniqueIdentifier, value: params.eventLogId },
      { name: "status", type: sql.NVarChar(32), value: params.status },
      { name: "providerMessageId", type: sql.NVarChar(256), value: params.providerMessageId ?? null },
      { name: "errorCode", type: sql.NVarChar(128), value: params.errorCode ?? null },
    ],
  );
}


type PairingRow = {
  IntegrationPairingID: string;
  BusinessID: string;
  ExpiresAtUtc: Date;
  UsedAtUtc: Date | null;
};

export async function createIntegrationPairing(params: {
  businessId: string;
  pairingCodeHash: string;
  expiresAtUtc: Date;
  createdByUserId?: string | null;
}): Promise<{ pairingId: string; expiresAtUtc: Date }> {
  const pairingId = randomUUID();
  await query(
    `INSERT INTO TblIntegrationPairing (
      IntegrationPairingID, BusinessID, PairingCodeHash, ExpiresAtUtc,
      CreatedByUserID, CreatedAtUtc
    ) VALUES (
      @pairingId, @businessId, @pairingCodeHash, @expiresAtUtc,
      @createdByUserId, SYSUTCDATETIME()
    )`,
    [
      { name: "pairingId", type: sql.UniqueIdentifier, value: pairingId },
      { name: "businessId", type: sql.UniqueIdentifier, value: params.businessId },
      { name: "pairingCodeHash", type: sql.NVarChar(128), value: params.pairingCodeHash },
      { name: "expiresAtUtc", type: sql.DateTime2, value: params.expiresAtUtc },
      {
        name: "createdByUserId",
        type: sql.UniqueIdentifier,
        value: params.createdByUserId ?? null,
      },
    ],
  );
  return { pairingId, expiresAtUtc: params.expiresAtUtc };
}

export async function consumeIntegrationPairing(params: {
  pairingCodeHash: string;
}): Promise<{
  pairingId: string;
  businessId: string;
  expiresAtUtc: Date;
} | null> {
  const result = await query<PairingRow>(
    `UPDATE TblIntegrationPairing
     SET UsedAtUtc = SYSUTCDATETIME()
     OUTPUT INSERTED.IntegrationPairingID, INSERTED.BusinessID,
            INSERTED.ExpiresAtUtc, INSERTED.UsedAtUtc
     WHERE PairingCodeHash = @pairingCodeHash
       AND UsedAtUtc IS NULL
       AND ExpiresAtUtc > SYSUTCDATETIME()`,
    [
      {
        name: "pairingCodeHash",
        type: sql.NVarChar(128),
        value: params.pairingCodeHash,
      },
    ],
  );
  const row = result.recordset[0];
  if (!row) return null;
  return {
    pairingId: normalizeUuid(row.IntegrationPairingID),
    businessId: normalizeUuid(row.BusinessID),
    expiresAtUtc: row.ExpiresAtUtc,
  };
}

export async function revokeOpenIntegrationPairings(params: {
  businessId: string;
}): Promise<void> {
  await query(
    `UPDATE TblIntegrationPairing
     SET UsedAtUtc = SYSUTCDATETIME()
     WHERE BusinessID = @businessId
       AND UsedAtUtc IS NULL
       AND ExpiresAtUtc > SYSUTCDATETIME()`,
    [
      { name: "businessId", type: sql.UniqueIdentifier, value: params.businessId },
    ],
  );
}


export async function releaseIntegrationPairing(params: {
  pairingId: string;
}): Promise<void> {
  await query(
    `UPDATE TblIntegrationPairing
     SET UsedAtUtc = NULL
     WHERE IntegrationPairingID = @pairingId
       AND ExpiresAtUtc > SYSUTCDATETIME()`,
    [
      {
        name: "pairingId",
        type: sql.UniqueIdentifier,
        value: params.pairingId,
      },
    ],
  );
}
