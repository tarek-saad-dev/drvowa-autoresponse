import { z } from "zod";
import { query, sql } from "@/lib/db";
import { NotFoundError } from "@/lib/tenancy/errors";
import { resolveChannelByExternalAccountKey } from "@/modules/messaging/repository";

const receipt = z.object({
  providerMessageId: z.string().trim().min(1).max(256),
  capturedAt: z.string().datetime({ offset: true }),
  status: z.enum(["PENDING", "DELIVERED", "FAILED", "QUARANTINED"]),
}).strict();

export const receiptBatchSchema = z.object({
  accountKey: z.string().min(1).max(64),
  records: z.array(receipt).min(1).max(100),
}).strict();

export type RuntimeReceiptBatch = z.infer<typeof receiptBatchSchema>;

/**
 * A separate, idempotent proof of capture from the Runtime's durable spool.
 * Resolving the business from accountKey (never request body BusinessID)
 * prevents cross-tenant audit writes.
 */
export async function recordRuntimeReceipts(batch: RuntimeReceiptBatch): Promise<number> {
  const channel = await resolveChannelByExternalAccountKey(batch.accountKey);
  if (!channel) throw new NotFoundError("Unknown WhatsApp account");
  for (const record of batch.records) {
    await query(
      `MERGE dbo.TblRuntimeInboundReceipt WITH (HOLDLOCK) AS target
       USING (SELECT @channelId AS ChannelConnectionID,
                     @pmid AS ProviderMessageID) source
       ON target.ChannelConnectionID = source.ChannelConnectionID
         AND target.ProviderMessageID = source.ProviderMessageID
       WHEN MATCHED THEN UPDATE SET
         LastReportedAtUtc = SYSUTCDATETIME(),
         DeliveryStatus = CASE
           WHEN target.DeliveryStatus = N'DELIVERED' THEN target.DeliveryStatus
           ELSE @status END,
         CapturedAtUtc = CASE WHEN @captured < target.CapturedAtUtc
           THEN @captured ELSE target.CapturedAtUtc END
       WHEN NOT MATCHED THEN
         INSERT (BusinessID, ChannelConnectionID, ProviderMessageID, CapturedAtUtc, DeliveryStatus)
         VALUES (@businessId, @channelId, @pmid, @captured, @status);`,
      [
        { name: "businessId", type: sql.UniqueIdentifier, value: channel.businessId },
        { name: "channelId", type: sql.UniqueIdentifier, value: channel.channelConnectionId },
        { name: "pmid", type: sql.NVarChar(256), value: record.providerMessageId },
        { name: "captured", type: sql.DateTime2, value: new Date(record.capturedAt) },
        { name: "status", type: sql.NVarChar(16), value: record.status },
      ],
    );
  }
  return batch.records.length;
}

export type ReliabilityIncident = {
  incidentId: string; incidentKind: string; referenceKey: string;
  conversationId: string | null; detailCode: string | null;
  detectedAtUtc: Date; lastSeenAtUtc: Date;
};

export async function getReliabilityOverview(businessId: string) {
  const args = [{ name: "businessId", type: sql.UniqueIdentifier, value: businessId }];
  const [counts, incidents] = await Promise.all([
    query<{
      captured: number; stored: number; missing: number;
      unacknowledged: number; openIncidents: number;
      aiSent: number; aiFailed: number; handoffPending: number;
    }>(
      `SELECT
       (SELECT COUNT(*) FROM dbo.TblRuntimeInboundReceipt r
         WHERE r.BusinessID=@businessId AND r.CapturedAtUtc >= DATEADD(hour,-24,SYSUTCDATETIME())) AS captured,
       (SELECT COUNT(*) FROM dbo.TblRuntimeInboundReceipt r
         JOIN dbo.TblMessage m ON m.ChannelConnectionID=r.ChannelConnectionID AND m.ProviderMessageID=r.ProviderMessageID
         WHERE r.BusinessID=@businessId AND m.Direction=N'INBOUND'
           AND r.CapturedAtUtc >= DATEADD(hour,-24,SYSUTCDATETIME())) AS stored,
       (SELECT COUNT(*) FROM dbo.TblRuntimeInboundReceipt r
         WHERE r.BusinessID=@businessId
           AND r.CapturedAtUtc >= DATEADD(hour,-24,SYSUTCDATETIME())
           AND r.CapturedAtUtc < DATEADD(minute,-2,SYSUTCDATETIME())
           AND NOT EXISTS (SELECT 1 FROM dbo.TblMessage m
             WHERE m.ChannelConnectionID=r.ChannelConnectionID AND m.ProviderMessageID=r.ProviderMessageID)) AS missing,
       (SELECT COUNT(*) FROM dbo.TblRuntimeInboundReceipt r
         WHERE r.BusinessID=@businessId AND r.CapturedAtUtc >= DATEADD(hour,-24,SYSUTCDATETIME())
           AND r.DeliveryStatus <> N'DELIVERED') AS unacknowledged,
       (SELECT COUNT(*) FROM dbo.TblReliabilityIncident i WHERE i.BusinessID=@businessId AND i.Status=N'OPEN') AS openIncidents,
       (SELECT COUNT(*) FROM dbo.TblAiReplyJob j
         WHERE j.BusinessID=@businessId AND j.CreatedAtUtc >= DATEADD(hour,-24,SYSUTCDATETIME())
           AND j.Status=N'SENT') AS aiSent,
       (SELECT COUNT(*) FROM dbo.TblAiReplyJob j
         WHERE j.BusinessID=@businessId AND j.CreatedAtUtc >= DATEADD(hour,-24,SYSUTCDATETIME())
           AND j.Status=N'FAILED') AS aiFailed,
       (SELECT COUNT(*) FROM dbo.TblConversationAiState s
         WHERE s.BusinessID=@businessId AND s.Mode=N'HUMAN_PAUSED') AS handoffPending`,
      args,
    ),
    query<{
      IncidentID: string; IncidentKind: string; ReferenceKey: string;
      ConversationID: string | null; DetailCode: string | null;
      DetectedAtUtc: Date; LastSeenAtUtc: Date;
    }>(
      `SELECT TOP (60) IncidentID, IncidentKind, ReferenceKey, ConversationID,
             DetailCode, DetectedAtUtc, LastSeenAtUtc
       FROM dbo.TblReliabilityIncident
       WHERE BusinessID=@businessId AND Status=N'OPEN'
       ORDER BY DetectedAtUtc DESC`,
      args,
    ),
  ]);
  return {
    counters: counts.recordset[0],
    incidents: incidents.recordset.map(row => ({
      incidentId: row.IncidentID,
      incidentKind: row.IncidentKind,
      referenceKey: row.ReferenceKey,
      conversationId: row.ConversationID,
      detailCode: row.DetailCode,
      detectedAtUtc: row.DetectedAtUtc,
      lastSeenAtUtc: row.LastSeenAtUtc,
    })),
  };
}

/**
 * Read-only reconciliation / incident recording. NO outbound send or retry.
 * Rule 1: Runtime says captured, but a matching SaaS inbound record is absent.
 * Rule 2: Latest eligible text hasn't produced a known sent or in-flight job.
 * Coalesced older inbound messages are not counted as missing replies.
 */
export async function runReliabilityAudit(): Promise<{ receiptIncidents: number; aiIncidents: number }> {
  const r = await query<{ BusinessID: string; ProviderMessageID: string; DeliveryStatus: string }>(
    `SELECT TOP (200) r.BusinessID, r.ProviderMessageID, r.DeliveryStatus
     FROM dbo.TblRuntimeInboundReceipt r
     WHERE r.CapturedAtUtc < DATEADD(minute,-2,SYSUTCDATETIME())
       AND r.CapturedAtUtc >= DATEADD(day,-7,SYSUTCDATETIME())
       AND NOT EXISTS (SELECT 1 FROM dbo.TblMessage m WHERE
         m.ChannelConnectionID=r.ChannelConnectionID
         AND m.ProviderMessageID=r.ProviderMessageID)
     ORDER BY r.CapturedAtUtc DESC`,
  );
  for (const row of r.recordset) {
    await upsertIncident(row.BusinessID, "RUNTIME_NOT_INGESTED", row.ProviderMessageID, null, row.DeliveryStatus);
  }

  // Only the latest inbound tail is actionable: older messages can be coalesced.
  const missing = await query<{ BusinessID: string; ConversationID: string; MessageID: string }>(
    `SELECT TOP (200) m.BusinessID, m.ConversationID, m.MessageID
     FROM dbo.TblMessage m
     INNER JOIN dbo.TblChannelAiSetting cfg ON cfg.BusinessID=m.BusinessID
       AND cfg.ChannelConnectionID=m.ChannelConnectionID
       AND cfg.AutoReplyEnabled=1 AND cfg.EnabledAtUtc <= m.ReceivedAtUtc
     LEFT JOIN dbo.TblConversationAiState state ON state.BusinessID=m.BusinessID
       AND state.ConversationID=m.ConversationID
     WHERE m.Direction=N'INBOUND' AND m.ContentType=N'TEXT'
       AND m.ReceivedAtUtc BETWEEN DATEADD(hour,-24,SYSUTCDATETIME())
         AND DATEADD(minute,-2,SYSUTCDATETIME())
       AND (state.Mode IS NULL OR state.Mode=N'AUTO')
       AND (state.ResumedAtUtc IS NULL OR m.ReceivedAtUtc >= state.ResumedAtUtc)
       AND NOT EXISTS (SELECT 1 FROM dbo.TblHumanEscalation e WHERE
         e.BusinessID=m.BusinessID AND e.ConversationID=m.ConversationID AND e.ResolvedAtUtc IS NULL)
       AND NOT EXISTS (SELECT 1 FROM dbo.TblMessage newer WHERE
         newer.BusinessID=m.BusinessID AND newer.ConversationID=m.ConversationID
         AND newer.Direction=N'INBOUND' AND newer.CreatedAtUtc>m.CreatedAtUtc)
       AND NOT EXISTS (SELECT 1 FROM dbo.TblMessage sent WHERE
         sent.BusinessID=m.BusinessID AND sent.ConversationID=m.ConversationID
         AND sent.Direction=N'OUTBOUND' AND sent.CreatedAtUtc>=m.CreatedAtUtc)
       AND NOT EXISTS (SELECT 1 FROM dbo.TblAiReplyJob j WHERE
         j.BusinessID=m.BusinessID AND j.ConversationID=m.ConversationID
         AND j.TriggerMessageID=m.MessageID AND j.Status IN
            (N'PENDING',N'PROCESSING',N'SENT',N'COALESCED'))
     ORDER BY m.ReceivedAtUtc DESC`,
  );
  for (const row of missing.recordset) {
    await upsertIncident(row.BusinessID, "AI_REPLY_MISSING", row.MessageID, row.ConversationID, "NO_ACTIVE_REPLY");
  }

  // Close capture incidents after evidence arrives. Re-open on a later true regression.
  await query(
    `UPDATE i SET Status=N'RESOLVED', ResolvedAtUtc=SYSUTCDATETIME(), LastSeenAtUtc=SYSUTCDATETIME()
     FROM dbo.TblReliabilityIncident i
     INNER JOIN dbo.TblRuntimeInboundReceipt r
       ON r.BusinessID=i.BusinessID AND r.ProviderMessageID=i.ReferenceKey
     WHERE i.Status=N'OPEN' AND i.IncidentKind=N'RUNTIME_NOT_INGESTED'
       AND EXISTS (SELECT 1 FROM dbo.TblMessage m WHERE
         m.ChannelConnectionID=r.ChannelConnectionID AND m.ProviderMessageID=r.ProviderMessageID)`,
  );
  await query(
    `UPDATE i SET Status=N'RESOLVED', ResolvedAtUtc=SYSUTCDATETIME(), LastSeenAtUtc=SYSUTCDATETIME()
     FROM dbo.TblReliabilityIncident i
     WHERE i.Status=N'OPEN' AND i.IncidentKind=N'AI_REPLY_MISSING'
       AND (EXISTS (SELECT 1 FROM dbo.TblAiReplyJob j WHERE
         j.BusinessID=i.BusinessID AND j.TriggerMessageID=TRY_CONVERT(uniqueidentifier,i.ReferenceKey)
         AND j.Status IN (N'PENDING',N'PROCESSING',N'SENT',N'COALESCED'))
       OR EXISTS (SELECT 1 FROM dbo.TblMessage m JOIN dbo.TblMessage sent
          ON sent.BusinessID=m.BusinessID AND sent.ConversationID=m.ConversationID
          AND sent.Direction=N'OUTBOUND' AND sent.CreatedAtUtc>=m.CreatedAtUtc
          WHERE m.BusinessID=i.BusinessID AND m.MessageID=TRY_CONVERT(uniqueidentifier,i.ReferenceKey)))`,
  );
  return { receiptIncidents: r.recordset.length, aiIncidents: missing.recordset.length };
}

async function upsertIncident(
  businessId: string, kind: string, referenceKey: string,
  conversationId: string | null, code: string,
): Promise<void> {
  await query(
    `MERGE dbo.TblReliabilityIncident WITH(HOLDLOCK) AS target
     USING (SELECT @businessId AS BusinessID, @kind AS IncidentKind,
           @reference AS ReferenceKey) source
     ON target.BusinessID=source.BusinessID AND target.IncidentKind=source.IncidentKind
       AND target.ReferenceKey=source.ReferenceKey
     WHEN MATCHED THEN UPDATE SET Status=N'OPEN', ResolvedAtUtc=NULL,
       LastSeenAtUtc=SYSUTCDATETIME(), DetailCode=@code
     WHEN NOT MATCHED THEN INSERT(BusinessID,IncidentKind,ReferenceKey,ConversationID,DetailCode)
     VALUES (@businessId,@kind,@reference,@conversationId,@code);`,
    [
      { name: "businessId", type: sql.UniqueIdentifier, value: businessId },
      { name: "kind", type: sql.NVarChar(48), value: kind },
      { name: "reference", type: sql.NVarChar(256), value: referenceKey },
      { name: "conversationId", type: sql.UniqueIdentifier, value: conversationId },
      { name: "code", type: sql.NVarChar(64), value: code },
    ],
  );
}
