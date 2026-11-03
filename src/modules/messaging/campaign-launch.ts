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

/**
 * Explicit owner action, no send occurs during HTTP.
 * Frozen message and eligible phone set must match the owner's current preview.
 */
export async function launchCampaign(params: {
  businessId: string; draftId: string; preflightId: string;
  userId: string; expectedEligible: number; expectedMessage: string;
}): Promise<CampaignDeliveryStatus> {
  if (!campaignsSendingEnabled()) {
    throw new ConflictError("تشغيل حملات واتساب غير مفعل على السيرفر حتى الآن.");
  }
  if (params.expectedEligible < 1 || params.expectedEligible > MAX_LAUNCH_RECIPIENTS) {
    throw new ValidationError("عدد المستلمين غير صالح.");
  }
  const meta = (await query<Meta>(
    metaQuery, scope(params.businessId, params.draftId, params.preflightId),
  )).recordset[0];
  if (!meta || !isValid(meta) || params.expectedMessage !== meta.MessageText) {
    throw new ConflictError("الرسالة أو القائمة اتغيرت. راجع الجمهور مرة تانية.");
  }
  // Fail closed on a disconnected or logged-out phone before any queue exists.
  const state = await getAccountStatus(meta.AccountKey!);
  if (!state.ready || state.state !== "READY") {
    throw new ConflictError("رقم واتساب مش متصل حاليًا.");
  }
  const runId = randomUUID();
  await withTransaction(async (trx: TransactionClient) => {
    const bound = scope(params.businessId, params.draftId, params.preflightId);
    const locked = (await trx.query<Meta>(
      metaQuery.replace("FROM dbo.TblWhatsAppCampaignPreflight p",
        "FROM dbo.TblWhatsAppCampaignPreflight p WITH (UPDLOCK, HOLDLOCK)"),
      bound,
    )).recordset[0];
    if (!locked || !isValid(locked)
        || locked.MessageText !== params.expectedMessage
        || locked.ChannelConnectionID !== meta.ChannelConnectionID) {
      throw new ConflictError("اتغيرت حالة المسودة أثناء التأكيد.");
    }
    const existing = await trx.query<{RunID:string}>(
      "SELECT RunID FROM dbo.TblWhatsAppCampaignRun WHERE BusinessID=@businessId AND PreflightID=@preflightId",
      bound,
    );
    if (existing.recordset.length) {
      throw new ConflictError("الحملة اتجهزت للإرسال قبل كده. مش هنبعتها مرتين.");
    }
    const c = candidateInputs(locked, params.businessId);
    const eligible = Number((await trx.query<{Total:number}>(candidateQuery, c))
      .recordset[0]?.Total ?? 0);
    if (eligible !== params.expectedEligible) {
      throw new ConflictError("عدد المستلمين اتغير. افتح المعاينة من جديد.");
    }
    if (eligible > MAX_LAUNCH_RECIPIENTS) {
      throw new ValidationError("الحد الأقصى للحملة الواحدة 60 مستلم.");
    }
    await trx.query(
      `INSERT INTO dbo.TblWhatsAppCampaignRun
        (RunID,BusinessID,CampaignDraftID,PreflightID,ChannelConnectionID,
         ProviderLabelID,MessageText,CopyHash,RequestedByUserID,Status,EligibleCount)
       VALUES (@runId,@businessId,@draftId,@preflightId,@channelConnectionId,
         @labelId,@messageText,@copyHash,@userId,N'QUEUED',@eligible)`,
      [
        ...bound,
        {name:"runId",type:sql.UniqueIdentifier,value:runId},
        {name:"channelConnectionId",type:sql.UniqueIdentifier,value:locked.ChannelConnectionID},
        {name:"labelId",type:sql.NVarChar(128),value:locked.ProviderLabelID},
        {name:"messageText",type:sql.NVarChar(3000),value:locked.MessageText},
        {name:"copyHash",type:sql.VarBinary(32),value:locked.CopyHash},
        {name:"userId",type:sql.UniqueIdentifier,value:params.userId},
        {name:"eligible",type:sql.Int,value:eligible},
      ],
    );
    const inserted = await trx.query(
      `INSERT INTO dbo.TblWhatsAppCampaignRunItem
         (RunID,BusinessID,PhoneNormalized,ContactID,Status)
       SELECT @runId,@businessId,pr.PhoneNormalized,pr.ContactID,N'PENDING'
       FROM dbo.TblWhatsAppCampaignPreflightRecipient pr
       JOIN dbo.TblWhatsAppCampaignPermission perm
         ON perm.BusinessID=pr.BusinessID
           AND perm.ChannelConnectionID=@channelConnectionId
           AND perm.PhoneNormalized=pr.PhoneNormalized
           AND perm.Source=N'EXPLICIT_INBOUND'
       JOIN dbo.TblWhatsAppContactLabel cl
         ON cl.BusinessID=pr.BusinessID
           AND cl.ContactID=pr.ContactID
           AND cl.ChannelConnectionID=@channelConnectionId
           AND cl.ProviderLabelID=@labelId AND cl.IsActive=1
       WHERE pr.BusinessID=@businessId AND pr.PreflightID=@preflightId
         AND pr.Status=N'BLOCKED'
         AND NOT EXISTS (SELECT 1 FROM dbo.TblWhatsAppCampaignOptOut o
           WHERE o.BusinessID=pr.BusinessID
             AND o.ChannelConnectionID=@channelConnectionId
             AND o.PhoneNormalized=pr.PhoneNormalized)
         AND NOT EXISTS (SELECT 1
           FROM dbo.TblWhatsAppCampaignRunItem oldItem
           JOIN dbo.TblWhatsAppCampaignRun oldRun ON oldRun.RunID=oldItem.RunID
           WHERE oldRun.BusinessID=pr.BusinessID
             AND oldRun.ChannelConnectionID=@channelConnectionId
             AND oldItem.PhoneNormalized=pr.PhoneNormalized
             AND oldItem.Status=N'SENT'
             AND oldItem.CompletedAtUtc>DATEADD(HOUR,-24,SYSUTCDATETIME()))`,
      [
        ...c,
        {name:"runId",type:sql.UniqueIdentifier,value:runId},
      ],
    );
    if (inserted.rowsAffected[0] !== eligible) {
      throw new ConflictError("جمهور الحملة اتغير أثناء حفظها.");
    }
    await trx.query(
      `IF NOT EXISTS (SELECT 1 FROM dbo.TblWhatsAppCampaignThrottle WITH(UPDLOCK,HOLDLOCK)
         WHERE ChannelConnectionID=@channelConnectionId)
       INSERT INTO dbo.TblWhatsAppCampaignThrottle(ChannelConnectionID,BusinessID)
       VALUES (@channelConnectionId,@businessId)`,
      c,
    );
  });
  const run = await getCampaignRunStatus(params);
  if (!run || run.runId !== runId) throw new ConflictError("الحملة اتحفظت لكن تعذر تحميل حالتها.");
  return run;
}

export async function changeCampaignRun(params: {
  businessId: string; draftId: string; preflightId: string;
  runId: string; action: "pause"|"resume"|"cancel";
}): Promise<CampaignDeliveryStatus> {
  const expected = params.action === "pause"
    ? ["QUEUED", "RUNNING"]
    : params.action === "resume" ? ["PAUSED"] : ["QUEUED", "RUNNING", "PAUSED"];
  const status = params.action === "pause" ? "PAUSED"
    : params.action === "resume" ? "QUEUED" : "CANCELLED";
  const run = await getCampaignRunStatus(params);
  if (!run || run.runId !== params.runId) throw new NotFoundError("الحملة غير موجودة.");
  if (!expected.includes(run.status)) throw new ConflictError("حالة الحملة مش بتسمح بالإجراء ده.");
  if (params.action === "resume") {
    const current = await previewCampaignLaunch(params);
    if (!current.labelActive) throw new ConflictError("المسودة اتغيرت أو رقم واتساب اتفصل.");
  }
  const changed = await query(
    `UPDATE dbo.TblWhatsAppCampaignRun
     SET Status=@status,UpdatedAtUtc=SYSUTCDATETIME()
     WHERE BusinessID=@businessId AND RunID=@runId AND CampaignDraftID=@draftId
       AND PreflightID=@preflightId AND Status IN (${expected.map((_,i)=>`@old${i}`).join(",")})`,
    [
      ...scope(params.businessId, params.draftId, params.preflightId),
      {name:"runId",type:sql.UniqueIdentifier,value:params.runId},
      {name:"status",type:sql.NVarChar(20),value:status},
      ...expected.map((v,i)=>({name:`old${i}`,type:sql.NVarChar(20),value:v})),
    ],
  );
  if (changed.rowsAffected[0] !== 1) throw new ConflictError("حالة الحملة اتغيرت أثناء الطلب.");
  const next = await getCampaignRunStatus(params);
  if (!next) throw new NotFoundError("الحملة غير موجودة.");
  return next;
}
