import { createHash, randomUUID } from "node:crypto";

import { query, sql, withTransaction, type QueryInput, type TransactionClient } from "@/lib/db";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/tenancy/errors";

/** V1 intentionally bounded to avoid accidental million-recipient plans. */
export const MAX_PREFLIGHT_UNIQUE_PHONES = 300;

type DraftRow = {
  CampaignDraftID: string;
  ChannelConnectionID: string;
  ProviderLabelID: string;
  MessageText: string;
  Status: string;
  LabelExists: boolean;
  LabelDeleted: boolean | null;
  ChannelActive: boolean;
};
type CountsRow = {
  Observed: number;
  UniquePhones: number;
  Invalid: number | null;
};
type PlanRow = {
  PreflightID: string;
  CampaignDraftID: string;
  CopyHash: Buffer;
  Status: "REVIEW_ONLY";
  ObservedMemberships: number;
  UniqueValidPhones: number;
  InvalidPhones: number;
  DuplicatePhones: number;
  CreatedAtUtc: Date;
  CurrentDraftCopy: string;
  CurrentDraftStatus: string;
};

export type CampaignPreflightSummary = {
  preflightId: string;
  draftId: string;
  status: "REVIEW_ONLY";
  observedMemberships: number;
  uniqueValidPhones: number;
  invalidPhones: number;
  duplicatePhones: number;
  blockedUnverifiedPermission: number;
  verifiedSendable: 0;
  isCurrentCopy: boolean;
  sendEnabled: false;
  syncCoverage: "EVENT_DRIVEN_PARTIAL";
  createdAtUtc: string;
  idempotent: boolean;
};

function scope(businessId: string, draftId: string): QueryInput[] {
  return [
    { name: "businessId", type: sql.UniqueIdentifier, value: businessId },
    { name: "draftId", type: sql.UniqueIdentifier, value: draftId },
  ];
}
function fingerprint(text: string): Buffer {
  return createHash("sha256").update(text, "utf8").digest();
}
function mapPlan(row: PlanRow, idempotent: boolean): CampaignPreflightSummary {
  return {
    preflightId: row.PreflightID,
    draftId: row.CampaignDraftID,
    status: "REVIEW_ONLY",
    observedMemberships: Number(row.ObservedMemberships),
    uniqueValidPhones: Number(row.UniqueValidPhones),
    invalidPhones: Number(row.InvalidPhones),
    duplicatePhones: Number(row.DuplicatePhones),
    blockedUnverifiedPermission: Number(row.UniqueValidPhones),
    verifiedSendable: 0,
    isCurrentCopy: row.CurrentDraftStatus === "COPY_APPROVED"
      && Buffer.compare(Buffer.from(row.CopyHash), fingerprint(row.CurrentDraftCopy)) === 0,
    sendEnabled: false,
    syncCoverage: "EVENT_DRIVEN_PARTIAL",
    createdAtUtc: new Date(row.CreatedAtUtc).toISOString(),
    idempotent,
  };
}

const planSelect = `
 SELECT p.PreflightID, p.CampaignDraftID, p.CopyHash, p.Status,
        p.ObservedMemberships, p.UniqueValidPhones, p.InvalidPhones, p.DuplicatePhones,
        p.CreatedAtUtc,
        d.MessageText AS CurrentDraftCopy, d.Status AS CurrentDraftStatus
 FROM dbo.TblWhatsAppCampaignPreflight p
 INNER JOIN dbo.TblWhatsAppLabelCampaignDraft d
   ON d.BusinessID=p.BusinessID AND d.CampaignDraftID=p.CampaignDraftID
 WHERE p.BusinessID=@businessId AND p.CampaignDraftID=@draftId
`;

async function getPlan(
  trx: TransactionClient,
  params: { businessId: string; draftId: string; copyHash: Buffer },
): Promise<PlanRow | null> {
  const res = await trx.query<PlanRow>(
    planSelect + " AND p.CopyHash=@copyHash",
    [...scope(params.businessId, params.draftId),
      { name: "copyHash", type: sql.VarBinary(32), value: params.copyHash }],
  );
  return res.recordset[0] ?? null;
}

const validPhone = `c.PhoneNormalized IS NOT NULL
  AND LEN(c.PhoneNormalized) BETWEEN 8 AND 15
  AND c.PhoneNormalized NOT LIKE '%[^0-9]%'`;

/**
 * Snapshot one reviewed draft, scoped to its linked WhatsApp account.
 * Recipient rows are durably BLOCKED, not QUEUED. There is intentionally no
 * transition to SENDING and no connection to the runtime send API.
 * Retries for the same approved copy are idempotent.
 */
export async function createLabelCampaignPreflight(params: {
  businessId: string;
  draftId: string;
  userId: string;
}): Promise<CampaignPreflightSummary> {
  return withTransaction(async trx => {
    const base = scope(params.businessId, params.draftId);
    const meta = await trx.query<DraftRow>(
      `SELECT d.CampaignDraftID, d.ChannelConnectionID, d.ProviderLabelID,
              d.MessageText, d.Status,
              CAST(CASE WHEN l.ProviderLabelID IS NULL THEN 0 ELSE 1 END AS BIT) AS LabelExists,
              l.IsDeleted AS LabelDeleted,
              CAST(CASE WHEN ch.ChannelConnectionID IS NULL THEN 0 ELSE 1 END AS BIT) AS ChannelActive
       FROM dbo.TblWhatsAppLabelCampaignDraft d WITH (UPDLOCK, HOLDLOCK)
       LEFT JOIN dbo.TblWhatsAppLabel l
         ON l.BusinessID=d.BusinessID AND l.ChannelConnectionID=d.ChannelConnectionID
            AND l.ProviderLabelID=d.ProviderLabelID
       LEFT JOIN dbo.TblChannelConnection ch
         ON ch.BusinessID=d.BusinessID AND ch.ChannelConnectionID=d.ChannelConnectionID
           AND ch.Channel=N'WHATSAPP' AND ch.IsActive=1 AND ch.Status=N'ACTIVE'
       WHERE d.BusinessID=@businessId AND d.CampaignDraftID=@draftId`,
      base,
    );
    const draft = meta.recordset[0];
    if (!draft) throw new NotFoundError("المسودة مش موجودة لهذا النشاط.");
    if (draft.Status !== "COPY_APPROVED") {
      throw new ConflictError("اعتمد صياغة الرسالة قبل تجهيز قائمة المستلمين.");
    }
    if (!draft.LabelExists || draft.LabelDeleted || !draft.ChannelActive) {
      throw new ConflictError("القائمة أو رقم واتساب مش نشط حاليًا.");
    }

    const copyHash = fingerprint(draft.MessageText);
    const existing = await getPlan(trx, { ...params, copyHash });
    if (existing) return mapPlan(existing, true);

    const fromLabel = `
      FROM dbo.TblWhatsAppContactLabel cl
      INNER JOIN dbo.TblContact c
        ON c.BusinessID=cl.BusinessID
          AND c.ChannelConnectionID=cl.ChannelConnectionID
          AND c.ContactID=cl.ContactID
      WHERE cl.BusinessID=@businessId
        AND cl.ChannelConnectionID=@channelConnectionId
        AND cl.ProviderLabelID=@labelId
        AND cl.IsActive=1
    `;
    const labelInputs: QueryInput[] = [
      { name: "businessId", type: sql.UniqueIdentifier, value: params.businessId },
      { name: "channelConnectionId", type: sql.UniqueIdentifier, value: draft.ChannelConnectionID },
      { name: "labelId", type: sql.NVarChar(128), value: draft.ProviderLabelID },
    ];
    const counts = await trx.query<CountsRow>(
      `SELECT COUNT_BIG(1) AS Observed,
              COUNT(DISTINCT CASE WHEN ${validPhone} THEN c.PhoneNormalized END) AS UniquePhones,
              SUM(CASE WHEN ${validPhone} THEN 0 ELSE 1 END) AS Invalid
       ${fromLabel}`,
      labelInputs,
    );
    const observed = Number(counts.recordset[0]?.Observed ?? 0);
    const unique = Number(counts.recordset[0]?.UniquePhones ?? 0);
    const invalid = Number(counts.recordset[0]?.Invalid ?? 0);
    if (unique > MAX_PREFLIGHT_UNIQUE_PHONES) {
      throw new ValidationError(
        `القائمة فيها أكتر من ${MAX_PREFLIGHT_UNIQUE_PHONES} رقم. لتجنب إرسال كبير بالخطأ، قسّم الجمهور.`,
      );
    }
    const duplicate = observed - invalid - unique;
    if (duplicate < 0) throw new ConflictError("أعداد الجمهور اتغيرت أثناء التحضير.");

    const preflightId = randomUUID();
    await trx.query(
      `INSERT INTO dbo.TblWhatsAppCampaignPreflight
        (PreflightID, BusinessID, CampaignDraftID, ChannelConnectionID,
         LabelID, CopyHash, RequestedByUserID, Status,
         ObservedMemberships, UniqueValidPhones, InvalidPhones, DuplicatePhones)
       VALUES (@preflightId, @businessId, @draftId, @channelConnectionId,
         @labelId, @copyHash, @userId, N'REVIEW_ONLY',
         @observed, @unique, @invalid, @duplicate)`,
      [
        ...base, ...labelInputs.filter(x => x.name !== "businessId"),
        { name: "preflightId", type: sql.UniqueIdentifier, value: preflightId },
        { name: "copyHash", type: sql.VarBinary(32), value: copyHash },
        { name: "userId", type: sql.UniqueIdentifier, value: params.userId },
        { name: "observed", type: sql.Int, value: observed },
        { name: "unique", type: sql.Int, value: unique },
        { name: "invalid", type: sql.Int, value: invalid },
        { name: "duplicate", type: sql.Int, value: duplicate },
      ],
    );

    // Unique primary key (BusinessID, PreflightID, PhoneNormalized) means
    // the same recipient can never appear twice in this immutable plan.
    if (unique > 0) {
      const inserted = await trx.query(
        `;WITH DistinctPhones AS (
          SELECT c.ContactID, c.PhoneNormalized,
            ROW_NUMBER() OVER (
              PARTITION BY c.PhoneNormalized ORDER BY c.ContactID
            ) AS RowRank
          ${fromLabel} AND ${validPhone}
        )
        INSERT INTO dbo.TblWhatsAppCampaignPreflightRecipient
          (BusinessID, PreflightID, ContactID, PhoneNormalized, Status, Reason)
        SELECT @businessId, @preflightId, ContactID, PhoneNormalized,
               N'BLOCKED', N'UNVERIFIED_PERMISSION'
        FROM DistinctPhones WHERE RowRank=1`,
        [...labelInputs,
          { name: "preflightId", type: sql.UniqueIdentifier, value: preflightId }],
      );
      if (inserted.rowsAffected[0] !== unique) {
        throw new ConflictError("الجمهور اتغير أثناء التحضير. جرّب تاني.");
      }
    }
    const created = await getPlan(trx, { ...params, copyHash });
    if (!created) throw new ConflictError("تعذر حفظ خطة الحملة.");
    return mapPlan(created, false);
  });
}

export async function listLabelCampaignPreflights(params: {
  businessId: string;
  draftId: string;
}): Promise<CampaignPreflightSummary[]> {
  const results = await query<PlanRow>(
    `SELECT TOP(10) p.PreflightID, p.CampaignDraftID, p.CopyHash, p.Status,
              p.ObservedMemberships, p.UniqueValidPhones, p.InvalidPhones,
              p.DuplicatePhones, p.CreatedAtUtc,
              d.MessageText AS CurrentDraftCopy, d.Status AS CurrentDraftStatus
       FROM dbo.TblWhatsAppCampaignPreflight p
       INNER JOIN dbo.TblWhatsAppLabelCampaignDraft d
          ON d.BusinessID=p.BusinessID AND d.CampaignDraftID=p.CampaignDraftID
       WHERE p.BusinessID=@businessId AND p.CampaignDraftID=@draftId
       ORDER BY p.CreatedAtUtc DESC`,
    scope(params.businessId, params.draftId),
  );
  return results.recordset.map(row => mapPlan(row, true));
}
