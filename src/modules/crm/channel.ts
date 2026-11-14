import { query, sql } from "@/lib/db";
import { normalizeUuid } from "@/lib/ids/uuid";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/tenancy/errors";

export type CrmWhatsAppChannel = {
  channelConnectionId: string;
  displayName: string | null;
  externalAccountKey: string | null;
  status: string;
  isActive: boolean;
};

/**
 * Resolves the WhatsApp channel used for CRM campaign eligibility/lists/drafts.
 * Fail-closed: missing, inactive, inaccessible, or ambiguous channels are rejected.
 * Never silently falls back to another channel.
 */
export async function requireCampaignWhatsAppChannel(params: {
  businessId: string;
  channelConnectionId?: string | null;
}): Promise<CrmWhatsAppChannel> {
  const requested = params.channelConnectionId?.trim() || null;

  if (requested) {
    const result = await query<{
      ChannelConnectionID: string;
      DisplayName: string | null;
      ExternalAccountKey: string | null;
      Status: string;
      IsActive: boolean;
    }>(
      `SELECT ChannelConnectionID, DisplayName, ExternalAccountKey, Status, IsActive
       FROM dbo.TblChannelConnection
       WHERE BusinessID = @businessId
         AND ChannelConnectionID = @channelId
         AND Channel = N'WHATSAPP'`,
      [
        { name: "businessId", type: sql.UniqueIdentifier, value: params.businessId },
        { name: "channelId", type: sql.UniqueIdentifier, value: requested },
      ],
    );
    const row = result.recordset[0];
    if (!row) {
      throw new NotFoundError("قناة واتساب المحددة غير موجودة لهذا النشاط");
    }
    if (!row.IsActive || row.Status !== "ACTIVE") {
      throw new ConflictError("قناة واتساب المحددة غير نشطة. اختر قناة نشطة أو أعد ربط الرقم.");
    }
    return {
      channelConnectionId: normalizeUuid(row.ChannelConnectionID),
      displayName: row.DisplayName,
      externalAccountKey: row.ExternalAccountKey,
      status: row.Status,
      isActive: Boolean(row.IsActive),
    };
  }

  const active = await query<{
    ChannelConnectionID: string;
    DisplayName: string | null;
    ExternalAccountKey: string | null;
    Status: string;
    IsActive: boolean;
  }>(
    `SELECT ChannelConnectionID, DisplayName, ExternalAccountKey, Status, IsActive
     FROM dbo.TblChannelConnection
     WHERE BusinessID = @businessId
       AND Channel = N'WHATSAPP'
       AND IsActive = 1
       AND Status = N'ACTIVE'
     ORDER BY CreatedAtUtc DESC`,
    [{ name: "businessId", type: sql.UniqueIdentifier, value: params.businessId }],
  );

  if (active.recordset.length === 0) {
    throw new ValidationError("لا توجد قناة واتساب نشطة. اربط رقم واتساب قبل بناء الحملة.");
  }
  if (active.recordset.length > 1) {
    throw new ValidationError(
      "يوجد أكثر من قناة واتساب نشطة. يجب اختيار القناة صراحة قبل معاينة الجمهور أو إنشاء المسودة.",
    );
  }

  const row = active.recordset[0];
  return {
    channelConnectionId: normalizeUuid(row.ChannelConnectionID),
    displayName: row.DisplayName,
    externalAccountKey: row.ExternalAccountKey,
    status: row.Status,
    isActive: Boolean(row.IsActive),
  };
}

export async function listCampaignWhatsAppChannels(params: {
  businessId: string;
}): Promise<CrmWhatsAppChannel[]> {
  const result = await query<{
    ChannelConnectionID: string;
    DisplayName: string | null;
    ExternalAccountKey: string | null;
    Status: string;
    IsActive: boolean;
  }>(
    `SELECT ChannelConnectionID, DisplayName, ExternalAccountKey, Status, IsActive
     FROM dbo.TblChannelConnection
     WHERE BusinessID = @businessId
       AND Channel = N'WHATSAPP'
     ORDER BY IsActive DESC, CreatedAtUtc DESC`,
    [{ name: "businessId", type: sql.UniqueIdentifier, value: params.businessId }],
  );
  return result.recordset.map((row) => ({
    channelConnectionId: normalizeUuid(row.ChannelConnectionID),
    displayName: row.DisplayName,
    externalAccountKey: row.ExternalAccountKey,
    status: row.Status,
    isActive: Boolean(row.IsActive),
  }));
}
