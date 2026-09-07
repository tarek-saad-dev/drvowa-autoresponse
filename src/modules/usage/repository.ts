import { randomUUID } from "node:crypto";

import { query, sql } from "@/lib/db";
import type { UsageEvent } from "@/types/domain";

type UsageRow = {
  UsageEventID: string;
  BusinessID: string;
  EventType: string;
  Quantity: number;
  OccurredAtUtc: Date;
  MetadataJson: string | null;
};

function mapUsage(row: UsageRow): UsageEvent {
  return {
    usageEventId: row.UsageEventID,
    businessId: row.BusinessID,
    eventType: row.EventType,
    quantity: row.Quantity,
    occurredAtUtc: row.OccurredAtUtc,
    metadataJson: row.MetadataJson,
  };
}

export async function listUsageEvents(params: {
  businessId: string;
  limit: number;
}): Promise<UsageEvent[]> {
  const limit = Math.min(Math.max(params.limit, 1), 500);
  const result = await query<UsageRow>(
    `SELECT TOP (@limit)
        UsageEventID, BusinessID, EventType, Quantity, OccurredAtUtc, MetadataJson
     FROM TblUsageEvent
     WHERE BusinessID = @businessId
     ORDER BY OccurredAtUtc DESC`,
    [
      {
        name: "businessId",
        type: sql.UniqueIdentifier,
        value: params.businessId,
      },
      { name: "limit", type: sql.Int, value: limit },
    ],
  );
  return result.recordset.map(mapUsage);
}

export async function insertUsageEvent(params: {
  businessId: string;
  eventType: string;
  quantity: number;
  occurredAtUtc?: Date;
  metadata?: Record<string, unknown> | null;
}): Promise<UsageEvent> {
  const usageEventId = randomUUID();
  const occurredAtUtc = params.occurredAtUtc ?? new Date();
  const metadataJson = params.metadata
    ? JSON.stringify(params.metadata)
    : null;

  await query(
    `INSERT INTO TblUsageEvent (
      UsageEventID, BusinessID, EventType, Quantity, OccurredAtUtc, MetadataJson
    ) VALUES (
      @usageEventId, @businessId, @eventType, @quantity, @occurredAtUtc, @metadataJson
    )`,
    [
      {
        name: "usageEventId",
        type: sql.UniqueIdentifier,
        value: usageEventId,
      },
      {
        name: "businessId",
        type: sql.UniqueIdentifier,
        value: params.businessId,
      },
      { name: "eventType", type: sql.NVarChar(64), value: params.eventType },
      { name: "quantity", type: sql.Int, value: params.quantity },
      { name: "occurredAtUtc", type: sql.DateTime2, value: occurredAtUtc },
      {
        name: "metadataJson",
        type: sql.NVarChar(sql.MAX),
        value: metadataJson,
      },
    ],
  );

  return {
    usageEventId,
    businessId: params.businessId,
    eventType: params.eventType,
    quantity: params.quantity,
    occurredAtUtc,
    metadataJson,
  };
}
