import { query, sql } from "@/lib/db";
import { NotFoundError } from "@/lib/tenancy/errors";

/**
 * Read-only, owner-scoped label audience preview.
 * IMPORTANT: These are observed memberships, not verified marketing opt-ins,
 * not a runnable recipient snapshot, and not a delivery authorization.
 */
type DraftMetaRow = {
  CampaignDraftID: string;
  LabelNameSnapshot: string;
  ProviderLabelID: string;
  ChannelConnectionID: string;
  Status: string;
  LabelPresent: boolean;
  LabelDeleted: boolean | null;
  ChannelActive: boolean;
};

type AudienceCountRow = {
  ObservedContacts: number;
  UniquePhones: number;
  InvalidPhoneRows: number;
};
type AudienceSampleRow = {
  LastFour: string;
  DisplayName: string | null;
};

export type LabelCampaignAudiencePreview = {
  draftId: string;
  labelName: string;
  status: string;
  observedContacts: number;
  uniquePhones: number;
  invalidPhoneRows: number;
  duplicatePhoneRows: number;
  sample: Array<{ maskedPhone: string; displayName: string | null }>;
  syncCoverage: "EVENT_DRIVEN_PARTIAL";
  labelStillActive: boolean;
  channelActive: boolean;
  audienceReady: false;
  sendingEnabled: false;
};

const phoneWhere = `
  c.PhoneNormalized IS NOT NULL
  AND LEN(c.PhoneNormalized) BETWEEN 8 AND 15
  AND c.PhoneNormalized NOT LIKE '%[^0-9]%'
`;

/** This read never exposes full phone numbers, sends messages or consumes quota. */
export async function getLabelCampaignAudiencePreview(params: {
  businessId: string;
  draftId: string;
}): Promise<LabelCampaignAudiencePreview> {
  const scope = [
    { name: "businessId", type: sql.UniqueIdentifier, value: params.businessId },
    { name: "draftId", type: sql.UniqueIdentifier, value: params.draftId },
  ];

  const metadata = await query<DraftMetaRow>(
    `SELECT d.CampaignDraftID, d.LabelNameSnapshot, d.ProviderLabelID,
            d.ChannelConnectionID, d.Status,
            CAST(CASE WHEN l.ProviderLabelID IS NULL THEN 0 ELSE 1 END AS BIT) AS LabelPresent,
            l.IsDeleted AS LabelDeleted,
            CAST(CASE WHEN ch.ChannelConnectionID IS NOT NULL AND ch.IsActive=1
                       THEN 1 ELSE 0 END AS BIT) AS ChannelActive
     FROM dbo.TblWhatsAppLabelCampaignDraft d
     LEFT JOIN dbo.TblWhatsAppLabel l
       ON l.BusinessID=d.BusinessID
      AND l.ChannelConnectionID=d.ChannelConnectionID
      AND l.ProviderLabelID=d.ProviderLabelID
     LEFT JOIN dbo.TblChannelConnection ch
       ON ch.BusinessID=d.BusinessID
      AND ch.ChannelConnectionID=d.ChannelConnectionID
      AND ch.Channel=N'WHATSAPP'
     WHERE d.BusinessID=@businessId AND d.CampaignDraftID=@draftId`,
    scope,
  );
  const draft = metadata.recordset[0];
  if (!draft) throw new NotFoundError("المسودة مش موجودة لهذا النشاط.");

  // A cancelled draft or deleted label never becomes a target.
  const labelStillActive = Boolean(draft.LabelPresent) && !Boolean(draft.LabelDeleted);
  const channelActive = Boolean(draft.ChannelActive);

  const commonJoin = `
    FROM dbo.TblWhatsAppContactLabel cl
    INNER JOIN dbo.TblContact c
      ON c.BusinessID=cl.BusinessID
      AND c.ChannelConnectionID=cl.ChannelConnectionID
      AND c.ContactID=cl.ContactID
    INNER JOIN dbo.TblWhatsAppLabelCampaignDraft d
      ON d.BusinessID=cl.BusinessID
      AND d.ChannelConnectionID=cl.ChannelConnectionID
      AND d.ProviderLabelID=cl.ProviderLabelID
    WHERE d.BusinessID=@businessId
      AND d.CampaignDraftID=@draftId
      AND cl.IsActive=1
      AND cl.BusinessID=@businessId
      AND c.BusinessID=@businessId
  `;

  const counts = await query<AudienceCountRow>(
    `SELECT COUNT_BIG(1) AS ObservedContacts,
            COUNT(DISTINCT CASE WHEN ${phoneWhere} THEN c.PhoneNormalized ELSE NULL END) AS UniquePhones,
            SUM(CASE WHEN ${phoneWhere} THEN 0 ELSE 1 END) AS InvalidPhoneRows
     ${commonJoin}`,
    scope,
  );
  const row = counts.recordset[0];
  const observed = Number(row?.ObservedContacts ?? 0);
  const unique = Number(row?.UniquePhones ?? 0);
  const invalid = Number(row?.InvalidPhoneRows ?? 0);

  const sample = await query<AudienceSampleRow>(
    `WITH ValidPhones AS (
       SELECT c.PhoneNormalized, MAX(c.DisplayName) AS DisplayName
       ${commonJoin} AND ${phoneWhere}
       GROUP BY c.PhoneNormalized
     )
     SELECT TOP (20)
            RIGHT(PhoneNormalized, 4) AS LastFour,
            DisplayName
     FROM ValidPhones
     ORDER BY PhoneNormalized`,
    scope,
  );
  return {
    draftId: params.draftId,
    labelName: draft.LabelNameSnapshot,
    status: draft.Status,
    observedContacts: observed,
    uniquePhones: unique,
    invalidPhoneRows: invalid,
    duplicatePhoneRows: Math.max(0, observed - invalid - unique),
    sample: sample.recordset.map(contact => ({
      maskedPhone: "***" + contact.LastFour,
      displayName: contact.DisplayName,
    })),
    syncCoverage: "EVENT_DRIVEN_PARTIAL",
    labelStillActive,
    channelActive,
    audienceReady: false,
    sendingEnabled: false,
  };
}
