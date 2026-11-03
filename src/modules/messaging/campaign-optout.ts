import { sql, type TransactionClient } from "@/lib/db";

/**
 * Conservative explicit opt-out intent only. Other customer messages must
 * never be interpreted as permission or an opt-out by broad substring matching.
 */
export function isCampaignOptOutRequest(text: string | null | undefined): boolean {
  const normalized = (text || "").trim().replace(/\s+/g, " ").replace(/[.!؟]+$/gu, "").trim().toLowerCase();
  if (normalized.length < 4 || normalized.length > 140) return false;
  return /^(?:stop|unsubscribe|إلغاء الاشتراك|الغاء الاشتراك|إيقاف العروض|ايقاف العروض|وقف العروض|اوقف العروض|أوقف العروض|مش عايز عروض|مش عاوز عروض|متبعتوش عروض|ماتبعتوش عروض|متبعتليش عروض|ماتبعتليش عروض|لا ترسلوا عروض|ماترسلوليش عروض)$/iu.test(normalized);
}

/** Called inside an already authenticated, live, private inbound transaction. */
export async function recordCampaignOptOut(params: {
  businessId: string;
  channelConnectionId: string;
  phoneNormalized: string | null;
  providerMessageId: string;
}, trx: TransactionClient): Promise<boolean> {
  if (!params.phoneNormalized || !/^\d{8,15}$/.test(params.phoneNormalized)) return false;
  await trx.execute(
    `MERGE dbo.TblWhatsAppCampaignOptOut WITH (HOLDLOCK) AS target
     USING (SELECT @businessId AS BusinessID, @channelConnectionId AS ChannelConnectionID,
                   @phone AS PhoneNormalized) AS source
     ON target.BusinessID=source.BusinessID
       AND target.ChannelConnectionID=source.ChannelConnectionID
       AND target.PhoneNormalized=source.PhoneNormalized
     WHEN MATCHED THEN UPDATE SET
       StoppedAtUtc=SYSUTCDATETIME(), ProviderMessageID=@messageId
     WHEN NOT MATCHED THEN INSERT
       (BusinessID,ChannelConnectionID,PhoneNormalized,ProviderMessageID)
       VALUES (source.BusinessID,source.ChannelConnectionID,source.PhoneNormalized,@messageId);`,
    [
      { name: "businessId", type: sql.UniqueIdentifier, value: params.businessId },
      { name: "channelConnectionId", type: sql.UniqueIdentifier, value: params.channelConnectionId },
      { name: "phone", type: sql.NVarChar(32), value: params.phoneNormalized },
      { name: "messageId", type: sql.NVarChar(256), value: params.providerMessageId },
    ],
  );
  return true;
}
