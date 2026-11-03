import { randomUUID } from "node:crypto";

import { query, sql, withTransaction } from "@/lib/db";
import { getMembership } from "@/modules/businesses/repository";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/tenancy/errors";
import { listMirroredWhatsAppLabels } from "./whatsapp-label-sync-service";
import { parseLabelCampaignCommand } from "./label-campaign-parser";

export type CampaignDraftStatus = "DRAFT" | "COPY_APPROVED" | "CANCELLED";
type CampaignDraftRow = {
  CampaignDraftID: string;
  BusinessID: string;
  ChannelConnectionID: string;
  ProviderLabelID: string;
  LabelNameSnapshot: string;
  MessageText: string;
  Status: CampaignDraftStatus;
  ObservedContactsAtDraft: number;
  CreatedAtUtc: Date;
  UpdatedAtUtc: Date;
  CopyApprovedAtUtc: Date | null;
};
export type LabelCampaignDraft = {
  draftId: string;
  labelName: string;
  messageText: string;
  observedContacts: number;
  eligibleContacts: 0;
  status: CampaignDraftStatus;
  createdAtUtc: string;
  updatedAtUtc: string;
  copyApprovedAtUtc: string | null;
  sendEnabled: false;
  audienceReady: false;
  coverage: "EVENT_DRIVEN_PARTIAL";
};
function mapDraft(row: CampaignDraftRow): LabelCampaignDraft {
  return {
    draftId: row.CampaignDraftID,
    labelName: row.LabelNameSnapshot,
    messageText: row.MessageText,
    observedContacts: Number(row.ObservedContactsAtDraft),
    eligibleContacts: 0, // no marketing consent verified or snapshotted
    status: row.Status,
    createdAtUtc: new Date(row.CreatedAtUtc).toISOString(),
    updatedAtUtc: new Date(row.UpdatedAtUtc).toISOString(),
    copyApprovedAtUtc: row.CopyApprovedAtUtc
      ? new Date(row.CopyApprovedAtUtc).toISOString() : null,
    sendEnabled: false,
    audienceReady: false,
    coverage: "EVENT_DRIVEN_PARTIAL",
  };
}
function bizParam(businessId: string) {
  return { name: "businessId", type: sql.UniqueIdentifier, value: businessId };
}

/** Only actual active OWNERs may command campaign drafts. A customer message never invokes this. */
export async function requireLabelCampaignOwner(params: {
  businessId: string;
  userId: string;
}): Promise<void> {
  const member = await getMembership(params);
  if (!member || member.status !== "ACTIVE" || member.role !== "OWNER") {
    throw new ForbiddenError("OWNER_ROLE_REQUIRED_FOR_CAMPAIGN");
  }
}

export async function listLabelCampaignDrafts(businessId: string) {
  const result = await query<CampaignDraftRow>(
    `SELECT TOP (25) CampaignDraftID, BusinessID, ChannelConnectionID, ProviderLabelID,
            LabelNameSnapshot, MessageText, Status, ObservedContactsAtDraft,
            CreatedAtUtc, UpdatedAtUtc, CopyApprovedAtUtc
     FROM dbo.TblWhatsAppLabelCampaignDraft
     WHERE BusinessID=@businessId
     ORDER BY CreatedAtUtc DESC, CampaignDraftID DESC`,
    [bizParam(businessId)],
  );
  return result.recordset.map(mapDraft);
}

export async function createLabelCampaignDrafts(params: {
  businessId: string;
  userId: string;
  text: string;
}): Promise<LabelCampaignDraft[]> {
  const labels = await listMirroredWhatsAppLabels(params.businessId);
  const commands = parseLabelCampaignCommand(params.text, labels);
  if (commands.length === 0) throw new ValidationError("مفيش قائمة واضحة في الطلب.");

  return withTransaction(async trx => {
    const newIds: string[] = [];
    for (const { label, messageText } of commands) {
      const draftId = randomUUID();
      // The DB, not the client or parser, authoritatively resolves the
      // active tenant-scoped label and counts its OBSERVED associations.
      const result = await trx.query(
        `INSERT INTO dbo.TblWhatsAppLabelCampaignDraft (
           CampaignDraftID, BusinessID, ChannelConnectionID, ProviderLabelID,
           LabelNameSnapshot, MessageText, RequestedByUserID,
           ObservedContactsAtDraft, Status
         )
         SELECT @draftId, l.BusinessID, l.ChannelConnectionID, l.ProviderLabelID,
                l.LabelName, @messageText, @userId,
                (SELECT COUNT(*) FROM dbo.TblWhatsAppContactLabel cl
                 WHERE cl.BusinessID=l.BusinessID
                   AND cl.ChannelConnectionID=l.ChannelConnectionID
                   AND cl.ProviderLabelID=l.ProviderLabelID AND cl.IsActive=1),
                N'DRAFT'
         FROM dbo.TblWhatsAppLabel l
         INNER JOIN dbo.TblChannelConnection ch
           ON ch.BusinessID=l.BusinessID AND ch.ChannelConnectionID=l.ChannelConnectionID
           AND ch.Channel=N'WHATSAPP' AND ch.IsActive=1
         WHERE l.BusinessID=@businessId AND l.ChannelConnectionID=@channelConnectionId
           AND l.ProviderLabelID=@labelId AND l.IsDeleted=0
           AND l.LabelName IS NOT NULL AND LTRIM(RTRIM(l.LabelName))<>N''`,
        [
          bizParam(params.businessId),
          { name: "draftId", type: sql.UniqueIdentifier, value: draftId },
          { name: "channelConnectionId", type: sql.UniqueIdentifier, value: label.channelConnectionId },
          { name: "labelId", type: sql.NVarChar(128), value: label.id },
          { name: "messageText", type: sql.NVarChar(3000), value: messageText },
          { name: "userId", type: sql.UniqueIdentifier, value: params.userId },
        ],
      );
      if (result.rowsAffected[0] !== 1) {
        throw new ConflictError("القائمة اتغيرت أثناء تجهيز المسودة. حدّث القوائم وجرّب تاني.");
      }
      newIds.push(draftId);
    }

    const result = await trx.query<CampaignDraftRow>(
      `SELECT CampaignDraftID, BusinessID, ChannelConnectionID, ProviderLabelID,
              LabelNameSnapshot, MessageText, Status, ObservedContactsAtDraft,
              CreatedAtUtc, UpdatedAtUtc, CopyApprovedAtUtc
       FROM dbo.TblWhatsAppLabelCampaignDraft
       WHERE BusinessID=@businessId AND CampaignDraftID IN (${newIds.map((_, i) => `@id${i}`).join(",")})
       ORDER BY CreatedAtUtc ASC, CampaignDraftID ASC`,
      [
        bizParam(params.businessId),
        ...newIds.map((id, i) => ({
          name: `id${i}`, type: sql.UniqueIdentifier, value: id,
        })),
      ],
    );
    if (result.recordset.length !== newIds.length) throw new ConflictError("تعذر مراجعة المسودات.");
    return result.recordset.map(mapDraft);
  });
}

export async function updateLabelCampaignDraft(params: {
  businessId: string;
  draftId: string;
  action: "update" | "approve_copy" | "cancel";
  messageText?: string;
}): Promise<LabelCampaignDraft> {
  const text = params.messageText?.trim();
  if ((params.action === "update" || params.action === "approve_copy")
    && (!text || text.length < 4 || text.length > 3000)) {
    throw new ValidationError("اكتب نص رسالة صحيح (4 إلى 3000 حرف).");
  }

  let statement = "";
  let values: Array<{ name: string; type: unknown; value: unknown }> = [];
  if (params.action === "update") {
    statement = `UPDATE dbo.TblWhatsAppLabelCampaignDraft
      SET MessageText=@messageText, Status=N'DRAFT',
          CopyApprovedAtUtc=NULL, UpdatedAtUtc=SYSUTCDATETIME()
      OUTPUT INSERTED.*
      WHERE BusinessID=@businessId AND CampaignDraftID=@draftId
        AND Status IN (N'DRAFT', N'COPY_APPROVED')`;
    values = [{ name: "messageText", type: sql.NVarChar(3000), value: text }];
  } else if (params.action === "approve_copy") {
    // Requires the *exact* reviewed text. A stale browser tab cannot approve
    // a different message after another tab edits it.
    statement = `UPDATE dbo.TblWhatsAppLabelCampaignDraft
      SET Status=N'COPY_APPROVED', CopyApprovedAtUtc=SYSUTCDATETIME(),
          UpdatedAtUtc=SYSUTCDATETIME()
      OUTPUT INSERTED.*
      WHERE BusinessID=@businessId AND CampaignDraftID=@draftId
        AND Status=N'DRAFT' AND MessageText=@messageText`;
    values = [{ name: "messageText", type: sql.NVarChar(3000), value: text }];
  } else if (params.action === "cancel") {
    statement = `UPDATE dbo.TblWhatsAppLabelCampaignDraft
      SET Status=N'CANCELLED', CopyApprovedAtUtc=NULL,
          UpdatedAtUtc=SYSUTCDATETIME()
      OUTPUT INSERTED.*
      WHERE BusinessID=@businessId AND CampaignDraftID=@draftId
        AND Status IN (N'DRAFT', N'COPY_APPROVED')`;
  } else {
    throw new ValidationError("إجراء غير مدعوم.");
  }

  const result = await query<CampaignDraftRow>(statement, [
    bizParam(params.businessId),
    { name: "draftId", type: sql.UniqueIdentifier, value: params.draftId },
    ...values,
  ]);
  const row = result.recordset[0];
  if (!row) throw new NotFoundError("المسودة مش موجودة، اتلغت أو اتعدلت بالفعل.");
  return mapDraft(row);
}
