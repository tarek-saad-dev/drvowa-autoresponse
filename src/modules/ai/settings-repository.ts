import { randomUUID } from "node:crypto";

import { query, sql, type TransactionClient } from "@/lib/db";
import { normalizeUuid } from "@/lib/ids/uuid";
import type { ChannelAiSetting } from "@/types/domain";

type SettingRow = {
  ChannelAiSettingID: string;
  BusinessID: string;
  ChannelConnectionID: string;
  AgentID: string;
  AutoReplyEnabled: boolean | number;
  EnabledAtUtc: Date | null;
  DebounceMs: number;
  CreatedAtUtc: Date;
  UpdatedAtUtc: Date;
};

function mapSetting(row: SettingRow): ChannelAiSetting {
  return {
    channelAiSettingId: normalizeUuid(row.ChannelAiSettingID),
    businessId: normalizeUuid(row.BusinessID),
    channelConnectionId: normalizeUuid(row.ChannelConnectionID),
    agentId: normalizeUuid(row.AgentID),
    autoReplyEnabled: Boolean(row.AutoReplyEnabled),
    enabledAtUtc: row.EnabledAtUtc,
    debounceMs: row.DebounceMs,
    createdAtUtc: row.CreatedAtUtc,
    updatedAtUtc: row.UpdatedAtUtc,
  };
}

function db(trx?: TransactionClient) {
  return { query: trx ? trx.query.bind(trx) : query };
}

export async function getChannelAiSettingByConnection(params: {
  businessId: string;
  channelConnectionId: string;
}, trx?: TransactionClient): Promise<ChannelAiSetting | null> {
  const result = await db(trx).query<SettingRow>(
    `SELECT ChannelAiSettingID, BusinessID, ChannelConnectionID, AgentID,
            AutoReplyEnabled, EnabledAtUtc, DebounceMs, CreatedAtUtc, UpdatedAtUtc
     FROM TblChannelAiSetting
     WHERE BusinessID = @businessId AND ChannelConnectionID = @channelConnectionId`,
    [
      { name: "businessId", type: sql.UniqueIdentifier, value: params.businessId },
      {
        name: "channelConnectionId",
        type: sql.UniqueIdentifier,
        value: params.channelConnectionId,
      },
    ],
  );
  const row = result.recordset[0];
  return row ? mapSetting(row) : null;
}

export async function getChannelAiSettingForBusiness(params: {
  businessId: string;
}): Promise<ChannelAiSetting | null> {
  const result = await query<SettingRow>(
    `SELECT TOP 1 s.ChannelAiSettingID, s.BusinessID, s.ChannelConnectionID, s.AgentID,
            s.AutoReplyEnabled, s.EnabledAtUtc, s.DebounceMs, s.CreatedAtUtc, s.UpdatedAtUtc
     FROM TblChannelAiSetting s
     INNER JOIN TblChannelConnection c
       ON c.ChannelConnectionID = s.ChannelConnectionID AND c.BusinessID = s.BusinessID
     WHERE s.BusinessID = @businessId
       AND c.Channel = N'WHATSAPP' AND c.Provider = N'BAILEYS'
     ORDER BY s.CreatedAtUtc ASC`,
    [
      { name: "businessId", type: sql.UniqueIdentifier, value: params.businessId },
    ],
  );
  const row = result.recordset[0];
  return row ? mapSetting(row) : null;
}

export async function upsertChannelAiSetting(params: {
  businessId: string;
  channelConnectionId: string;
  agentId: string;
  autoReplyEnabled: boolean;
  debounceMs?: number;
}): Promise<ChannelAiSetting> {
  const existing = await getChannelAiSettingByConnection({
    businessId: params.businessId,
    channelConnectionId: params.channelConnectionId,
  });

  const debounceMs = Math.min(
    Math.max(params.debounceMs ?? existing?.debounceMs ?? 900, 0),
    10_000,
  );

  // Enabling: set watermark NOW. Disabling: clear EnabledAtUtc.
  // Already enabled staying enabled: keep prior EnabledAtUtc.
  let enabledAtUtc: Date | null = null;
  if (params.autoReplyEnabled) {
    if (existing?.autoReplyEnabled && existing.enabledAtUtc) {
      enabledAtUtc = existing.enabledAtUtc;
    } else {
      enabledAtUtc = new Date();
    }
  }

  if (existing) {
    await query(
      `UPDATE TblChannelAiSetting
       SET AgentID = @agentId,
           AutoReplyEnabled = @autoReplyEnabled,
           EnabledAtUtc = @enabledAtUtc,
           DebounceMs = @debounceMs,
           UpdatedAtUtc = SYSUTCDATETIME()
       WHERE BusinessID = @businessId AND ChannelAiSettingID = @settingId`,
      [
        { name: "agentId", type: sql.UniqueIdentifier, value: params.agentId },
        {
          name: "autoReplyEnabled",
          type: sql.Bit,
          value: params.autoReplyEnabled,
        },
        { name: "enabledAtUtc", type: sql.DateTime2, value: enabledAtUtc },
        { name: "debounceMs", type: sql.Int, value: debounceMs },
        {
          name: "businessId",
          type: sql.UniqueIdentifier,
          value: params.businessId,
        },
        {
          name: "settingId",
          type: sql.UniqueIdentifier,
          value: existing.channelAiSettingId,
        },
      ],
    );
    const updated = await getChannelAiSettingByConnection({
      businessId: params.businessId,
      channelConnectionId: params.channelConnectionId,
    });
    return updated!;
  }

  const settingId = randomUUID();
  await query(
    `INSERT INTO TblChannelAiSetting (
       ChannelAiSettingID, BusinessID, ChannelConnectionID, AgentID,
       AutoReplyEnabled, EnabledAtUtc, DebounceMs, CreatedAtUtc, UpdatedAtUtc
     ) VALUES (
       @settingId, @businessId, @channelConnectionId, @agentId,
       @autoReplyEnabled, @enabledAtUtc, @debounceMs, SYSUTCDATETIME(), SYSUTCDATETIME()
     )`,
    [
      { name: "settingId", type: sql.UniqueIdentifier, value: settingId },
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
      { name: "agentId", type: sql.UniqueIdentifier, value: params.agentId },
      {
        name: "autoReplyEnabled",
        type: sql.Bit,
        value: params.autoReplyEnabled,
      },
      { name: "enabledAtUtc", type: sql.DateTime2, value: enabledAtUtc },
      { name: "debounceMs", type: sql.Int, value: debounceMs },
    ],
  );

  const created = await getChannelAiSettingByConnection({
    businessId: params.businessId,
    channelConnectionId: params.channelConnectionId,
  });
  return created!;
}
