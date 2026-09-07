import { randomUUID } from "node:crypto";

import { query, sql } from "@/lib/db";
import type {
  ChannelConnection,
  ChannelConnectionStatus,
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
  CreatedAtUtc: Date;
  UpdatedAtUtc: Date;
};

function mapConnection(row: ChannelRow): ChannelConnection {
  return {
    channelConnectionId: row.ChannelConnectionID,
    businessId: row.BusinessID,
    locationId: row.LocationID,
    channel: row.Channel,
    provider: row.Provider,
    externalAccountKey: row.ExternalAccountKey,
    displayName: row.DisplayName,
    maskedPhone: row.MaskedPhone,
    status: row.Status as ChannelConnectionStatus,
    isActive: Boolean(row.IsActive),
    createdAtUtc: row.CreatedAtUtc,
    updatedAtUtc: row.UpdatedAtUtc,
  };
}

export async function listChannelConnections(params: {
  businessId: string;
}): Promise<ChannelConnection[]> {
  const result = await query<ChannelRow>(
    `SELECT ChannelConnectionID, BusinessID, LocationID, Channel, Provider,
            ExternalAccountKey, DisplayName, MaskedPhone, Status, IsActive,
            CreatedAtUtc, UpdatedAtUtc
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

export async function getChannelConnection(params: {
  businessId: string;
  channelConnectionId: string;
}): Promise<ChannelConnection | null> {
  const result = await query<ChannelRow>(
    `SELECT ChannelConnectionID, BusinessID, LocationID, Channel, Provider,
            ExternalAccountKey, DisplayName, MaskedPhone, Status, IsActive,
            CreatedAtUtc, UpdatedAtUtc
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
export async function createChannelConnectionShell(params: {
  businessId: string;
  channel?: string;
  provider?: string;
  locationId?: string | null;
  displayName?: string | null;
}): Promise<ChannelConnection> {
  const channelConnectionId = randomUUID();
  const now = new Date();
  const channel = params.channel ?? "WHATSAPP";
  const provider = params.provider ?? "BAILEYS";
  const status: ChannelConnectionStatus = "PENDING";
  const isActive = false;

  await query(
    `INSERT INTO TblChannelConnection (
      ChannelConnectionID, BusinessID, LocationID, Channel, Provider,
      ExternalAccountKey, DisplayName, MaskedPhone, Status, IsActive,
      CreatedAtUtc, UpdatedAtUtc
    ) VALUES (
      @channelConnectionId, @businessId, @locationId, @channel, @provider,
      NULL, @displayName, NULL, @status, @isActive,
      @createdAtUtc, @updatedAtUtc
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
        name: "displayName",
        type: sql.NVarChar(200),
        value: params.displayName ?? null,
      },
      { name: "status", type: sql.NVarChar(32), value: status },
      { name: "isActive", type: sql.Bit, value: isActive },
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
    externalAccountKey: null,
    displayName: params.displayName ?? null,
    maskedPhone: null,
    status,
    isActive,
    createdAtUtc: now,
    updatedAtUtc: now,
  };
}
