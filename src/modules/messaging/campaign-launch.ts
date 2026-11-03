import { createHash, randomUUID } from "node:crypto";
import { query, sql, withTransaction, type QueryInput, type TransactionClient } from "@/lib/db";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/tenancy/errors";
import { getAccountStatus } from "@/modules/channels/runtime-client";

export const MAX_LAUNCH_RECIPIENTS = 60;
export function campaignsSendingEnabled(): boolean {
  return process.env.DRVO_LABEL_CAMPAIGNS_SEND_ENABLED === "true";
}
function digest(text: string): Buffer {
  return createHash("sha256").update(text, "utf8").digest();
}
function scope(businessId: string, draftId: string, preflightId: string): QueryInput[] {
  return [
    { name: "businessId", type: sql.UniqueIdentifier, value: businessId },
    { name: "draftId", type: sql.UniqueIdentifier, value: draftId },
    { name: "preflightId", type: sql.UniqueIdentifier, value: preflightId },
  ];
}
type Meta = {
  PreflightID: string; CampaignDraftID: string; ChannelConnectionID: string;
  ProviderLabelID: string; MessageText: string; DraftStatus: string;
  CopyHash: Buffer; AccountKey: string | null; ChannelStatus: string | null;
  LabelDeleted: boolean | null; LabelExists: boolean; BusinessName: string;
};
const metaQuery = `
 SELECT p.PreflightID, p.CampaignDraftID, p.ChannelConnectionID,
        p.LabelID AS ProviderLabelID, d.MessageText, d.Status AS DraftStatus,
        p.CopyHash, ch.ExternalAccountKey AS AccountKey, ch.Status AS ChannelStatus,
        l.IsDeleted AS LabelDeleted,
        CAST(CASE WHEN l.ProviderLabelID IS NULL THEN 0 ELSE 1 END AS BIT) AS LabelExists,
        b.Name AS BusinessName
 FROM dbo.TblWhatsAppCampaignPreflight p
 JOIN dbo.TblWhatsAppLabelCampaignDraft d
   ON d.BusinessID=p.BusinessID AND d.CampaignDraftID=p.CampaignDraftID
     AND d.ChannelConnectionID=p.ChannelConnectionID AND d.ProviderLabelID=p.LabelID
 JOIN dbo.TblBusiness b ON b.BusinessID=p.BusinessID AND b.Status=N'ACTIVE'
 LEFT JOIN dbo.TblChannelConnection ch
   ON ch.ChannelConnectionID=p.ChannelConnectionID AND ch.BusinessID=p.BusinessID
     AND ch.Channel=N'WHATSAPP' AND ch.IsActive=1
 LEFT JOIN dbo.TblWhatsAppLabel l
   ON l.BusinessID=p.BusinessID AND l.ChannelConnectionID=p.ChannelConnectionID
     AND l.ProviderLabelID=p.LabelID
 WHERE p.BusinessID=@businessId AND p.CampaignDraftID=@draftId
   AND p.PreflightID=@preflightId
`;
function isValid(meta: Meta): boolean {
  return meta.DraftStatus === "COPY_APPROVED"
    && Buffer.compare(digest(meta.MessageText), Buffer.from(meta.CopyHash)) === 0
    && meta.ChannelStatus === "ACTIVE" && Boolean(meta.AccountKey)
    && Boolean(meta.LabelExists) && !Boolean(meta.LabelDeleted);
}
const candidateQuery = `
 SELECT COUNT_BIG(1) AS Total FROM dbo.TblWhatsAppCampaignPreflightRecipient pr
 JOIN dbo.TblWhatsAppCampaignPermission perm
   ON perm.BusinessID=pr.BusinessID AND perm.PhoneNormalized=pr.PhoneNormalized
   AND perm.ChannelConnectionID=@channelConnectionId AND perm.Source=N'EXPLICIT_INBOUND'
 JOIN dbo.TblWhatsAppContactLabel cl
   ON cl.BusinessID=pr.BusinessID AND cl.ContactID=pr.ContactID
   AND cl.ChannelConnectionID=@channelConnectionId AND cl.ProviderLabelID=@labelId
   AND cl.IsActive=1
 WHERE pr.BusinessID=@businessId AND pr.PreflightID=@preflightId
   AND pr.Status=N'BLOCKED'
   AND NOT EXISTS (SELECT 1 FROM dbo.TblWhatsAppCampaignOptOut o
     WHERE o.BusinessID=pr.BusinessID AND o.ChannelConnectionID=@channelConnectionId
       AND o.PhoneNormalized=pr.PhoneNormalized)
   AND NOT EXISTS (SELECT 1
     FROM dbo.TblWhatsAppCampaignRunItem previous
     JOIN dbo.TblWhatsAppCampaignRun oldRun ON oldRun.RunID=previous.RunID
     WHERE oldRun.BusinessID=pr.BusinessID AND oldRun.ChannelConnectionID=@channelConnectionId
       AND previous.PhoneNormalized=pr.PhoneNormalized
       AND previous.Status=N'SENT'
       AND previous.CompletedAtUtc>DATEADD(HOUR,-24,SYSUTCDATETIME()))
`;
function candidateInputs(meta: Meta, businessId: string): QueryInput[] {
  return [
    { name: "businessId", type: sql.UniqueIdentifier, value: businessId },
    { name: "preflightId", type: sql.UniqueIdentifier, value: meta.PreflightID },
    { name: "channelConnectionId", type: sql.UniqueIdentifier, value: meta.ChannelConnectionID },
    { name: "labelId", type: sql.NVarChar(128), value: meta.ProviderLabelID },
  ];
}
type RunRow = {
  RunID: string; Status: "QUEUED"|"RUNNING"|"PAUSED"|"COMPLETED"|"CANCELLED";
  EligibleCount: number; CreatedAtUtc: Date;
  Pending: number; InFlight: number; Sent: number; Failed: number; Unknown: number; Skipped: number;
};
export type CampaignDeliveryStatus = {
  runId: string; status: RunRow["Status"]; total: number; pending: number;
  inFlight: number; sent: number; failed: number; unknown: number; skipped: number;
  createdAtUtc: string;
};
function mapRun(row: RunRow): CampaignDeliveryStatus {
  return {
    runId: row.RunID, status: row.Status, total: Number(row.EligibleCount),
    pending: Number(row.Pending), inFlight: Number(row.InFlight), sent: Number(row.Sent),
    failed: Number(row.Failed), unknown: Number(row.Unknown), skipped: Number(row.Skipped),
    createdAtUtc: new Date(row.CreatedAtUtc).toISOString(),
  };
}
const summarySelect = `
 SELECT TOP (1) run.RunID, run.Status, run.EligibleCount, run.CreatedAtUtc,
        SUM(CASE WHEN item.Status=N'PENDING' THEN 1 ELSE 0 END) AS Pending,
        SUM(CASE WHEN item.Status=N'IN_FLIGHT' THEN 1 ELSE 0 END) AS InFlight,
        SUM(CASE WHEN item.Status=N'SENT' THEN 1 ELSE 0 END) AS Sent,
        SUM(CASE WHEN item.Status=N'FAILED' THEN 1 ELSE 0 END) AS Failed,
        SUM(CASE WHEN item.Status=N'UNKNOWN' THEN 1 ELSE 0 END) AS Unknown,
        SUM(CASE WHEN item.Status=N'SKIPPED' THEN 1 ELSE 0 END) AS Skipped
 FROM dbo.TblWhatsAppCampaignRun run
 JOIN dbo.TblWhatsAppCampaignRunItem item ON item.RunID=run.RunID
 WHERE run.BusinessID=@businessId AND run.CampaignDraftID=@draftId
   AND run.PreflightID=@preflightId
 GROUP BY run.RunID,run.Status,run.EligibleCount,run.CreatedAtUtc
`;
export async function getCampaignRunStatus(
  params: {businessId: string; draftId: string; preflightId: string},
): Promise<CampaignDeliveryStatus | null> {
  const r = await query<RunRow>(summarySelect, scope(params.businessId, params.draftId, params.preflightId));
  return r.recordset[0] ? mapRun(r.recordset[0]) : null;
}
export async function previewCampaignLaunch(
  params: {businessId: string; draftId: string; preflightId: string},
) {
  const inputs = scope(params.businessId, params.draftId, params.preflightId);
  const meta = (await query<Meta>(metaQuery, inputs)).recordset[0];
  if (!meta) throw new NotFoundError("خطة مراجعة الجمهور غير موجودة.");
  const currentCopy = isValid(meta);
  const existingRun = await getCampaignRunStatus(params);
  const count = currentCopy
    ? Number((await query<{Total: number}>(candidateQuery, candidateInputs(meta, params.businessId)))
      .recordset[0]?.Total ?? 0)
    : 0;
  return {
    eligible: count, canLaunch: campaignsSendingEnabled() && currentCopy
      && count > 0 && count <= MAX_LAUNCH_RECIPIENTS && !existingRun,
    enabled: campaignsSendingEnabled(),
    labelActive: currentCopy,
    alreadyLaunched: Boolean(existingRun),
    businessName: meta.BusinessName,
    optInText: `أوافق على استقبال عروض ${meta.BusinessName} على واتساب`,
    sendRate: "رسالة كل 60 ثانية، بحد أقصى 60 خلال 24 ساعة لكل رقم عمل",
    run: existingRun,
    coverage: "EVENT_DRIVEN_PARTIAL" as const,
  };
}
