import { randomUUID } from "node:crypto";

import { query, sql, withTransaction, type QueryInput } from "@/lib/db";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/tenancy/errors";
import { upsertContact } from "./repository";

/**
 * Internal DRVO audience lists. These are NOT native WhatsApp Business labels.
 * Reuses existing campaign membership and permission checks without pretending
 * that the linked device exposes complete historical WhatsApp label data.
 */
export const DRVO_LIST_PREFIX = "drvo:";
export const MAX_IMPORT_AT_ONCE = 50;
export const MAX_LIST_MEMBERS = 5000;
const scope = (businessId: string, listId: string): QueryInput[] => [
  { name: "businessId", type: sql.UniqueIdentifier, value: businessId },
  { name: "listId", type: sql.NVarChar(128), value: listId },
];

export function isDrvoListId(value: string): boolean {
  return /^drvo:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function normalizeCampaignPhone(raw: string): string | null {
  const candidate = raw.trim();
  if (!/^\+?[\d ()-]+$/.test(candidate)) return null;
  let digits = candidate.replace(/[^0-9]/g, "");
  // Egyptian local mobile numbers: 010, 011, 012, 015.
  if (/^01[0125]\d{8}$/.test(digits)) digits = "2" + digits;
  return /^\d{8,15}$/.test(digits) ? digits : null;
}

export function parseListPhones(text: string): string[] {
  if (text.length > 3000) throw new ValidationError("القائمة كبيرة جدًا. ضيف لحد 50 رقم في المرة.");
  const parts = text.split(/[\n,،;؛]+/u).map(value => value.trim()).filter(Boolean);
  if (!parts.length || parts.length > MAX_IMPORT_AT_ONCE) {
    throw new ValidationError("ضيف من 1 إلى 50 رقم في المرة، كل رقم في سطر.");
  }
  const seen = new Set<string>();
  for (const item of parts) {
    const number = normalizeCampaignPhone(item);
    if (!number) throw new ValidationError("في رقم غير صحيح. استخدم رقم بمفتاح الدولة أو رقم موبايل مصري.");
    seen.add(number);
  }
  return [...seen];
}

type ChannelRow = { ChannelConnectionID: string };
type ListRow = {
  ProviderLabelID: string; LabelName: string;
  ChannelConnectionID: string; IsDeleted: boolean;
};
const localListSelect = `
 SELECT l.ProviderLabelID,l.LabelName,l.ChannelConnectionID,l.IsDeleted
 FROM dbo.TblWhatsAppLabel l WITH (UPDLOCK,HOLDLOCK)
 JOIN dbo.TblChannelConnection ch
   ON ch.BusinessID=l.BusinessID AND ch.ChannelConnectionID=l.ChannelConnectionID
   AND ch.Channel=N'WHATSAPP' AND ch.IsActive=1 AND ch.Status=N'ACTIVE'
 WHERE l.BusinessID=@businessId AND l.ProviderLabelID=@listId
   AND l.ProviderLabelID LIKE N'drvo:%' AND l.IsDeleted=0
`;

export async function createDrvoList(params: {
  businessId: string; name: string;
}): Promise<{ id: string; name: string; channelConnectionId: string }> {
  const name = params.name.trim().replace(/\s+/gu, " ");
  if (name.length < 2 || name.length > 80) {
    throw new ValidationError("اسم القائمة لازم يكون من 2 إلى 80 حرف.");
  }
  return withTransaction(async trx => {
    const channels = await trx.query<ChannelRow>(
      `SELECT TOP(2) ChannelConnectionID FROM dbo.TblChannelConnection
       WHERE BusinessID=@businessId AND Channel=N'WHATSAPP'
         AND IsActive=1 AND Status=N'ACTIVE'
       ORDER BY CreatedAtUtc DESC`,
      [{ name: "businessId", type: sql.UniqueIdentifier, value: params.businessId }],
    );
    if (!channels.recordset.length) {
      throw new ConflictError("لازم توصل رقم واتساب أولًا عشان تعمل قائمة عملاء.");
    }
    if (channels.recordset.length > 1) {
      throw new ConflictError("في أكتر من رقم واتساب نشط؛ حدد الرقم قبل إنشاء قائمة.");
    }
    const channelConnectionId = channels.recordset[0].ChannelConnectionID;
    const id = DRVO_LIST_PREFIX + randomUUID();
    const inputs = [
      { name: "businessId", type: sql.UniqueIdentifier, value: params.businessId },
      { name: "channelConnectionId", type: sql.UniqueIdentifier, value: channelConnectionId },
      { name: "listId", type: sql.NVarChar(128), value: id },
      { name: "labelName", type: sql.NVarChar(200), value: name },
    ];
    const inserted = await trx.query(
      `INSERT INTO dbo.TblWhatsAppLabel
        (BusinessID,ChannelConnectionID,ProviderLabelID,LabelName,IsDeleted)
       SELECT @businessId,@channelConnectionId,@listId,@labelName,0
       WHERE NOT EXISTS (
         SELECT 1 FROM dbo.TblWhatsAppLabel WITH(UPDLOCK,HOLDLOCK)
         WHERE BusinessID=@businessId AND ChannelConnectionID=@channelConnectionId
           AND LabelName=@labelName AND IsDeleted=0
       )`,
      inputs,
    );
    if (inserted.rowsAffected[0] !== 1) {
      throw new ConflictError("اسم القائمة موجود بالفعل. اختار اسم مختلف.");
    }
    return { id, name, channelConnectionId };
  });
}

export async function addDrvoListPhones(params: {
  businessId: string; listId: string; phones: string[];
}): Promise<{ added: number; total: number }> {
  if (!isDrvoListId(params.listId)) throw new ValidationError("دي مش قائمة DRVO.");
  if (!params.phones.length || params.phones.length > MAX_IMPORT_AT_ONCE) {
    throw new ValidationError("ضيف من 1 إلى 50 رقم في المرة.");
  }
  // Revalidate on the server (never trust values sent by the browser).
  const phones = [...new Set(params.phones.map(value => normalizeCampaignPhone(value)))];
  if (phones.includes(null)) throw new ValidationError("في رقم غير صحيح.");
  return withTransaction(async trx => {
    const list = (await trx.query<ListRow>(localListSelect,
      scope(params.businessId, params.listId))).recordset[0];
    if (!list) throw new NotFoundError("القائمة مش موجودة أو رقم واتساب مش متصل.");
    const channel = list.ChannelConnectionID;
    const inputs = [
      ...scope(params.businessId, params.listId),
      { name: "channelId", type: sql.UniqueIdentifier, value: channel },
    ];
    const current = await trx.query<{ Total: number }>(
      `SELECT COUNT_BIG(1) AS Total FROM dbo.TblWhatsAppContactLabel
       WHERE BusinessID=@businessId AND ProviderLabelID=@listId
         AND ChannelConnectionID=@channelId AND IsActive=1`, inputs,
    );
    if (Number(current.recordset[0]?.Total ?? 0) + phones.length > MAX_LIST_MEMBERS) {
      throw new ValidationError("القائمة وصلت للحد الأقصى 5000 عميل.");
    }
    let added = 0;
    for (const phone of phones) {
      const contact = await upsertContact({
        businessId: params.businessId, channelConnectionId: channel,
        externalContactKey: phone!, phoneNormalized: phone!,
      }, trx);
      const result = await trx.query<{ WasActive: boolean }>(
        `MERGE dbo.TblWhatsAppContactLabel WITH (HOLDLOCK) AS target
         USING (SELECT @businessId AS BusinessID,@channelId AS ChannelConnectionID,
                       @listId AS ProviderLabelID,@contactId AS ContactID) AS source
         ON target.BusinessID=source.BusinessID
           AND target.ChannelConnectionID=source.ChannelConnectionID
           AND target.ProviderLabelID=source.ProviderLabelID
           AND target.ContactID=source.ContactID
         WHEN MATCHED THEN UPDATE SET IsActive=1,UpdatedAtUtc=SYSUTCDATETIME()
         WHEN NOT MATCHED THEN INSERT (BusinessID,ChannelConnectionID,ProviderLabelID,ContactID,IsActive)
           VALUES(source.BusinessID,source.ChannelConnectionID,source.ProviderLabelID,source.ContactID,1)
         OUTPUT CAST(ISNULL(deleted.IsActive,0) AS BIT) AS WasActive;`,
        [
          ...inputs,
          { name: "contactId", type: sql.UniqueIdentifier, value: contact.contactId },
        ],
      );
      if (!Boolean(result.recordset[0]?.WasActive)) added++;
    }
    const total = await trx.query<{ Total: number }>(
      `SELECT COUNT_BIG(1) AS Total FROM dbo.TblWhatsAppContactLabel
       WHERE BusinessID=@businessId AND ChannelConnectionID=@channelId
         AND ProviderLabelID=@listId AND IsActive=1`, inputs,
    );
    return { added, total: Number(total.recordset[0]?.Total ?? 0) };
  });
}

export async function listDrvoListMembers(params: { businessId: string; listId: string }) {
  if (!isDrvoListId(params.listId)) throw new ValidationError("دي مش قائمة DRVO.");
  const result = await query<{
    PhoneNormalized: string; DisplayName: string | null;
  }>(
    `SELECT TOP (250) c.PhoneNormalized,c.DisplayName
     FROM dbo.TblWhatsAppLabel l
     JOIN dbo.TblWhatsAppContactLabel cl ON cl.BusinessID=l.BusinessID
       AND cl.ChannelConnectionID=l.ChannelConnectionID
       AND cl.ProviderLabelID=l.ProviderLabelID AND cl.IsActive=1
     JOIN dbo.TblContact c ON c.ContactID=cl.ContactID AND c.BusinessID=l.BusinessID
       AND c.ChannelConnectionID=l.ChannelConnectionID
     WHERE l.BusinessID=@businessId AND l.ProviderLabelID=@listId
       AND l.ProviderLabelID LIKE N'drvo:%' AND l.IsDeleted=0
       AND c.PhoneNormalized IS NOT NULL
     ORDER BY c.PhoneNormalized`, scope(params.businessId, params.listId),
  );
  return result.recordset.map(row => ({
    phone: row.PhoneNormalized, name: row.DisplayName,
  }));
}

export async function removeDrvoListPhone(params: {
  businessId: string; listId: string; phone: string;
}): Promise<boolean> {
  if (!isDrvoListId(params.listId)) throw new ValidationError("دي مش قائمة DRVO.");
  const phone = normalizeCampaignPhone(params.phone);
  if (!phone) throw new ValidationError("رقم غير صحيح.");
  const result = await query(
    `UPDATE cl SET IsActive=0,UpdatedAtUtc=SYSUTCDATETIME()
     FROM dbo.TblWhatsAppContactLabel cl
     JOIN dbo.TblWhatsAppLabel l ON l.BusinessID=cl.BusinessID
       AND l.ChannelConnectionID=cl.ChannelConnectionID
       AND l.ProviderLabelID=cl.ProviderLabelID
     JOIN dbo.TblContact c ON c.ContactID=cl.ContactID AND c.BusinessID=cl.BusinessID
       AND c.ChannelConnectionID=cl.ChannelConnectionID
     WHERE cl.BusinessID=@businessId AND cl.ProviderLabelID=@listId
       AND cl.IsActive=1 AND l.IsDeleted=0 AND l.ProviderLabelID LIKE N'drvo:%'
       AND c.PhoneNormalized=@phone`,
    [...scope(params.businessId, params.listId),
      { name: "phone", type: sql.NVarChar(32), value: phone }],
  );
  return result.rowsAffected.some(n => n > 0);
}

export async function deleteDrvoList(params: { businessId: string; listId: string }) {
  if (!isDrvoListId(params.listId)) throw new ValidationError("دي مش قائمة DRVO.");
  const affected = await query(
    `UPDATE dbo.TblWhatsAppLabel SET IsDeleted=1,UpdatedAtUtc=SYSUTCDATETIME()
     WHERE BusinessID=@businessId AND ProviderLabelID=@listId
       AND ProviderLabelID LIKE N'drvo:%' AND IsDeleted=0`,
    scope(params.businessId, params.listId),
  );
  if (!affected.rowsAffected.some(n => n > 0)) throw new NotFoundError("القائمة مش موجودة.");
}


/** Read-only, owner-facing one-number diagnostic. Never grants permission
 * or schedules a WhatsApp send. Native WhatsApp labels are not mutated. */
export async function checkDrvoListTestRecipient(params: {
  businessId: string;
  listId: string;
  phone: string;
}): Promise<{
  inList: boolean;
  hasPermission: boolean;
  optedOut: boolean;
  eligibleForReview: boolean;
  businessName: string;
  optInText: string;
}> {
  if (!isDrvoListId(params.listId)) {
    throw new ValidationError("اختار قائمة DRVO لاختبار رقم واحد.");
  }
  const phone = normalizeCampaignPhone(params.phone);
  if (!phone) throw new ValidationError("اكتب رقم موبايل صحيح، بمفتاح الدولة أو بصيغة مصرية.");
  const result = await query<{
    BusinessName: string;
    InList: boolean;
    HasPermission: boolean;
    OptedOut: boolean;
  }>(
    `SELECT TOP (1) b.Name AS BusinessName,
      CAST(CASE WHEN EXISTS (
        SELECT 1 FROM dbo.TblWhatsAppContactLabel cl
        JOIN dbo.TblContact c ON c.ContactID=cl.ContactID
          AND c.BusinessID=cl.BusinessID AND c.ChannelConnectionID=cl.ChannelConnectionID
        WHERE cl.BusinessID=l.BusinessID
          AND cl.ChannelConnectionID=l.ChannelConnectionID
          AND cl.ProviderLabelID=l.ProviderLabelID AND cl.IsActive=1
          AND c.PhoneNormalized=@phone
      ) THEN 1 ELSE 0 END AS BIT) AS InList,
      CAST(CASE WHEN EXISTS (
        SELECT 1 FROM dbo.TblWhatsAppCampaignPermission perm
        WHERE perm.BusinessID=l.BusinessID AND perm.ChannelConnectionID=l.ChannelConnectionID
          AND perm.PhoneNormalized=@phone AND perm.Source=N'EXPLICIT_INBOUND'
      ) THEN 1 ELSE 0 END AS BIT) AS HasPermission,
      CAST(CASE WHEN EXISTS (
        SELECT 1 FROM dbo.TblWhatsAppCampaignOptOut stopped
        WHERE stopped.BusinessID=l.BusinessID AND stopped.ChannelConnectionID=l.ChannelConnectionID
          AND stopped.PhoneNormalized=@phone
      ) THEN 1 ELSE 0 END AS BIT) AS OptedOut
    FROM dbo.TblWhatsAppLabel l
    JOIN dbo.TblChannelConnection ch
      ON ch.BusinessID=l.BusinessID AND ch.ChannelConnectionID=l.ChannelConnectionID
      AND ch.Channel=N'WHATSAPP' AND ch.IsActive=1 AND ch.Status=N'ACTIVE'
    JOIN dbo.TblBusiness b ON b.BusinessID=l.BusinessID AND b.Status=N'ACTIVE'
    WHERE l.BusinessID=@businessId AND l.ProviderLabelID=@listId
      AND l.ProviderLabelID LIKE N'drvo:%' AND l.IsDeleted=0`,
    [
      ...scope(params.businessId, params.listId),
      { name: "phone", type: sql.NVarChar(32), value: phone },
    ],
  );
  const row = result.recordset[0];
  if (!row) throw new NotFoundError("قائمة DRVO مش موجودة أو رقم واتساب مش نشط.");
  const inList = Boolean(row.InList);
  const hasPermission = Boolean(row.HasPermission);
  const optedOut = Boolean(row.OptedOut);
  return {
    inList, hasPermission, optedOut,
    eligibleForReview: inList && hasPermission && !optedOut,
    businessName: row.BusinessName,
    optInText: `أوافق على استقبال عروض ${row.BusinessName} على واتساب`,
  };
}
