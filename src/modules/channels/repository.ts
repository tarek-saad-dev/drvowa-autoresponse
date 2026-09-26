import { randomUUID } from "node:crypto";

import { query, sql, type TransactionClient } from "@/lib/db";
import { normalizeNullableUuid, normalizeUuid } from "@/lib/ids/uuid";
import type {
  ChannelConnection,
  ChannelConnectionStatus,
  CompatibilityStatus,
  WhatsAppRuntimeEngine,
} from "@/types/domain";

type ChannelRow = {
  ChannelConnectionID: string;
  BusinessID: string;
  LocationID: string | null;
  Channel: string;
  Provider: string;
  ExternalAccountKey: string | null;
  DisplayName: string | null;
  MaskedPhone: string | null;
  Status: string;
  IsActive: boolean;
  RuntimeEngine?: string | null;
  CompatibilityStatus?: string | null;
  CompatibilityReason?: string | null;
  CompatibilityUpdatedAt?: Date | null;
  RecommendedRuntimeEngine?: string | null;
  CreatedAtUtc: Date;
  UpdatedAtUtc: Date;
};

const CONNECTION_SELECT = `ChannelConnectionID, BusinessID, LocationID, Channel, Provider,
            ExternalAccountKey, DisplayName, MaskedPhone, Status, IsActive,
            ISNULL(RuntimeEngine, N'BAILEYS_V6') AS RuntimeEngine,
            CompatibilityStatus, CompatibilityReason, CompatibilityUpdatedAt,
            RecommendedRuntimeEngine,
            CreatedAtUtc, UpdatedAtUtc`;

function normalizeRuntimeEngine(value: string | null | undefined): WhatsAppRuntimeEngine {
  return value === "BAILEYS_V7" ? "BAILEYS_V7" : "BAILEYS_V6";
}

function normalizeCompatibilityStatus(
  value: string | null | undefined,
): CompatibilityStatus | null {
  switch (value) {
    case "UNKNOWN":
    case "HEALTHY":
    case "SUSPECT":
    case "DEGRADED_CRYPTO":
      return value;
    default:
      return null;
  }
}

function normalizeRecommendedEngine(
  value: string | null | undefined,
): WhatsAppRuntimeEngine | null {
  if (value === "BAILEYS_V7" || value === "BAILEYS_V6") return value;
  return null;
}

function db(trx?: TransactionClient) {
  return {
    query: trx?.query.bind(trx) ?? query,
  };
}

function mapConnection(row: ChannelRow): ChannelConnection {
  return {
    channelConnectionId: normalizeUuid(row.ChannelConnectionID),
    businessId: normalizeUuid(row.BusinessID),
    locationId: normalizeNullableUuid(row.LocationID),
    channel: row.Channel,
    provider: row.Provider,
    externalAccountKey: row.ExternalAccountKey,
    displayName: row.DisplayName,
    maskedPhone: row.MaskedPhone,
    status: row.Status as ChannelConnectionStatus,
    isActive: Boolean(row.IsActive),
    runtimeEngine: normalizeRuntimeEngine(row.RuntimeEngine),
    compatibilityStatus: normalizeCompatibilityStatus(row.CompatibilityStatus),
    compatibilityReason: row.CompatibilityReason ?? null,
    compatibilityUpdatedAt: row.CompatibilityUpdatedAt ?? null,
    recommendedRuntimeEngine: normalizeRecommendedEngine(
      row.RecommendedRuntimeEngine,
    ),
    createdAtUtc: row.CreatedAtUtc,
    updatedAtUtc: row.UpdatedAtUtc,
  };
}

export async function listChannelConnections(params: {
  businessId: string;
}): Promise<ChannelConnection[]> {
  const result = await query<ChannelRow>(
    `SELECT ${CONNECTION_SELECT}
     FROM TblChannelConnection
     WHERE BusinessID = @businessId
     ORDER BY CreatedAtUtc DESC`,
    [
      {
        name: "businessId",
        type: sql.UniqueIdentifier,
        value: params.businessId,
      },
    ],
  );
  return result.recordset.map(mapConnection);
}

export async function findWhatsAppConnection(params: {
  businessId: string;
}): Promise<ChannelConnection | null> {
  const result = await query<ChannelRow>(
    `SELECT TOP 1 ${CONNECTION_SELECT}
     FROM TblChannelConnection
     WHERE BusinessID = @businessId
       AND Channel = N'WHATSAPP'
       AND Provider = N'BAILEYS'
     ORDER BY CreatedAtUtc ASC`,
    [
      {
        name: "businessId",
        type: sql.UniqueIdentifier,
        value: params.businessId,
      },
    ],
  );
  const row = result.recordset[0];
  return row ? mapConnection(row) : null;
}

export async function getChannelConnection(params: {
  businessId: string;
  channelConnectionId: string;
}): Promise<ChannelConnection | null> {
  const result = await query<ChannelRow>(
    `SELECT TOP 1 ${CONNECTION_SELECT}
     FROM TblChannelConnection
     WHERE BusinessID = @businessId AND ChannelConnectionID = @channelConnectionId`,
    [
      {
        name: "businessId",
        type: sql.UniqueIdentifier,
        value: params.businessId,
      },
      {
        name: "channelConnectionId",
        type: sql.UniqueIdentifier,
        value: params.channelConnectionId,
      },
    ],
  );
  const row = result.recordset[0];
  return row ? mapConnection(row) : null;
}

/**
 * Creates an inactive control-plane shell row (no WhatsApp runtime).
 */
export async function createChannelConnectionShell(
  params: {
  businessId: string;
  channel?: string;
  provider?: string;
  locationId?: string | null;
  displayName?: string | null;
  externalAccountKey?: string | null;
  status?: ChannelConnectionStatus;
  isActive?: boolean;
  },
  trx?: TransactionClient,
): Promise<ChannelConnection> {
  const channelConnectionId = randomUUID();
  const now = new Date();
  const channel = params.channel ?? "WHATSAPP";
  const provider = params.provider ?? "BAILEYS";
  const status: ChannelConnectionStatus = params.status ?? "PENDING";
  const isActive = params.isActive ?? false;
  const externalAccountKey = params.externalAccountKey ?? null;

  const runtimeEngine: WhatsAppRuntimeEngine = "BAILEYS_V6";

  await db(trx).query(
    `INSERT INTO TblChannelConnection (
      ChannelConnectionID, BusinessID, LocationID, Channel, Provider,
      ExternalAccountKey, DisplayName, MaskedPhone, Status, IsActive,
      RuntimeEngine, CreatedAtUtc, UpdatedAtUtc
    ) VALUES (
      @channelConnectionId, @businessId, @locationId, @channel, @provider,
      @externalAccountKey, @displayName, NULL, @status, @isActive,
      @runtimeEngine, @createdAtUtc, @updatedAtUtc
    )`,
    [
      {
        name: "channelConnectionId",
        type: sql.UniqueIdentifier,
        value: channelConnectionId,
      },
      {
        name: "businessId",
        type: sql.UniqueIdentifier,
        value: params.businessId,
      },
      {
        name: "locationId",
        type: sql.UniqueIdentifier,
        value: params.locationId ?? null,
      },
      { name: "channel", type: sql.NVarChar(64), value: channel },
      { name: "provider", type: sql.NVarChar(64), value: provider },
      {
        name: "externalAccountKey",
        type: sql.NVarChar(256),
        value: externalAccountKey,
      },
      {
        name: "displayName",
        type: sql.NVarChar(200),
        value: params.displayName ?? null,
      },
      { name: "status", type: sql.NVarChar(32), value: status },
      { name: "isActive", type: sql.Bit, value: isActive },
      { name: "runtimeEngine", type: sql.NVarChar(32), value: runtimeEngine },
      { name: "createdAtUtc", type: sql.DateTime2, value: now },
      { name: "updatedAtUtc", type: sql.DateTime2, value: now },
    ],
  );

  return {
    channelConnectionId,
    businessId: params.businessId,
    locationId: params.locationId ?? null,
    channel,
    provider,
    externalAccountKey,
    displayName: params.displayName ?? null,
    maskedPhone: null,
    status,
    isActive,
    runtimeEngine,
    compatibilityStatus: null,
    compatibilityReason: null,
    compatibilityUpdatedAt: null,
    recommendedRuntimeEngine: null,
    createdAtUtc: now,
    updatedAtUtc: now,
  };
}

export async function updateChannelConnection(params: {
  businessId: string;
  channelConnectionId: string;
  status?: ChannelConnectionStatus;
  isActive?: boolean;
  displayName?: string | null;
  maskedPhone?: string | null;
  externalAccountKey?: string | null;
}): Promise<ChannelConnection | null> {
  const existing = await getChannelConnection({
    businessId: params.businessId,
    channelConnectionId: params.channelConnectionId,
  });
  if (!existing) {
    return null;
  }

  const next = {
    status: params.status ?? existing.status,
    isActive: params.isActive ?? existing.isActive,
    displayName:
      params.displayName === undefined ? existing.displayName : params.displayName,
    maskedPhone:
      params.maskedPhone === undefined ? existing.maskedPhone : params.maskedPhone,
    externalAccountKey:
      params.externalAccountKey === undefined
        ? existing.externalAccountKey
        : params.externalAccountKey,
  };
  const now = new Date();

  await query(
    `UPDATE TblChannelConnection
     SET Status = @status,
         IsActive = @isActive,
         DisplayName = @displayName,
         MaskedPhone = @maskedPhone,
         ExternalAccountKey = @externalAccountKey,
         UpdatedAtUtc = @updatedAtUtc
     WHERE BusinessID = @businessId AND ChannelConnectionID = @channelConnectionId`,
    [
      {
        name: "businessId",
        type: sql.UniqueIdentifier,
        value: params.businessId,
      },
      {
        name: "channelConnectionId",
        type: sql.UniqueIdentifier,
        value: params.channelConnectionId,
      },
      { name: "status", type: sql.NVarChar(32), value: next.status },
      { name: "isActive", type: sql.Bit, value: next.isActive },
      {
        name: "displayName",
        type: sql.NVarChar(200),
        value: next.displayName,
      },
      {
        name: "maskedPhone",
        type: sql.NVarChar(64),
        value: next.maskedPhone,
      },
      {
        name: "externalAccountKey",
        type: sql.NVarChar(256),
        value: next.externalAccountKey,
      },
      { name: "updatedAtUtc", type: sql.DateTime2, value: now },
    ],
  );

  return {
    ...existing,
    ...next,
    updatedAtUtc: now,
  };
}

/**
 * Persist Phase 1 compatibility observation only.
 * Never writes high-frequency crypto counters. Never mutates RuntimeEngine.
 */
export async function updateCompatibilityObservation(params: {
  businessId: string;
  channelConnectionId: string;
  compatibilityStatus: CompatibilityStatus;
  compatibilityReason: string | null;
  recommendedRuntimeEngine: WhatsAppRuntimeEngine;
}): Promise<ChannelConnection | null> {
  const existing = await getChannelConnection({
    businessId: params.businessId,
    channelConnectionId: params.channelConnectionId,
  });
  if (!existing) return null;

  const now = new Date();
  await query(
    `UPDATE TblChannelConnection
     SET CompatibilityStatus = @compatibilityStatus,
         CompatibilityReason = @compatibilityReason,
         CompatibilityUpdatedAt = @compatibilityUpdatedAt,
         RecommendedRuntimeEngine = @recommendedRuntimeEngine,
         UpdatedAtUtc = @updatedAtUtc
     WHERE BusinessID = @businessId AND ChannelConnectionID = @channelConnectionId`,
    [
      {
        name: "businessId",
        type: sql.UniqueIdentifier,
        value: params.businessId,
      },
      {
        name: "channelConnectionId",
        type: sql.UniqueIdentifier,
        value: params.channelConnectionId,
      },
      {
        name: "compatibilityStatus",
        type: sql.NVarChar(32),
        value: params.compatibilityStatus,
      },
      {
        name: "compatibilityReason",
        type: sql.NVarChar(128),
        value: params.compatibilityReason,
      },
      {
        name: "compatibilityUpdatedAt",
        type: sql.DateTime2,
        value: now,
      },
      {
        name: "recommendedRuntimeEngine",
        type: sql.NVarChar(32),
        value: params.recommendedRuntimeEngine,
      },
      { name: "updatedAtUtc", type: sql.DateTime2, value: now },
    ],
  );

  return {
    ...existing,
    compatibilityStatus: params.compatibilityStatus,
    compatibilityReason: params.compatibilityReason,
    compatibilityUpdatedAt: now,
    recommendedRuntimeEngine: params.recommendedRuntimeEngine,
    updatedAtUtc: now,
  };
}

/** Platform-admin: list all WhatsApp channel connections (no tenant filter). */
export async function listAllWhatsAppConnections(): Promise<
  Array<ChannelConnection & { businessName?: string | null }>
> {
  const result = await query<ChannelRow & { BusinessName?: string | null }>(
    `SELECT c.ChannelConnectionID, c.BusinessID, c.LocationID, c.Channel, c.Provider,
            c.ExternalAccountKey, c.DisplayName, c.MaskedPhone, c.Status, c.IsActive,
            ISNULL(c.RuntimeEngine, N'BAILEYS_V6') AS RuntimeEngine,
            c.CompatibilityStatus, c.CompatibilityReason, c.CompatibilityUpdatedAt,
            c.RecommendedRuntimeEngine,
            c.CreatedAtUtc, c.UpdatedAtUtc,
            b.Name AS BusinessName
     FROM TblChannelConnection c
     LEFT JOIN TblBusiness b ON b.BusinessID = c.BusinessID
     WHERE c.Channel = N'WHATSAPP' AND c.Provider = N'BAILEYS'
     ORDER BY c.UpdatedAtUtc DESC`,
  );
  return result.recordset.map((row) => ({
    ...mapConnection(row),
    businessName: row.BusinessName ?? null,
  }));
}
