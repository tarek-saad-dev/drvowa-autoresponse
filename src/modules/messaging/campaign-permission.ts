import { sql, type TransactionClient } from "@/lib/db";

/** A clear, specific response from the contact, naming the business and WhatsApp offers.
 * There is deliberately NO inferred opt-in from contact labels, any normal inbound,
 * prior appointments, "yes", or an owner's blanket assertion. */
export function isExplicitCampaignOptIn(text: string | null | undefined, businessName: string): boolean {
  const name = businessName.trim().normalize("NFKC");
  if (!name || name.length > 200 || !text) return false;
  const normalize = (s: string) => s.normalize("NFKC").replace(/\s+/gu, " ")
    .replace(/[.!؟]+$/gu, "").trim().toLocaleLowerCase("en");
  const actual = normalize(text);
  return actual === normalize(`أوافق على استقبال عروض ${name} على واتساب`)
    || actual === normalize(`اشترك في عروض ${name} على واتساب`)
    || actual === normalize(`i agree to receive whatsapp offers from ${name}`);
}

/** Called only when a real, fresh, direct inbound message was successfully inserted. */
export async function recordExplicitCampaignOptIn(params: {
  businessId: string;
  channelConnectionId: string;
  phoneNormalized: string | null;
  providerMessageId: string;
  evidenceText: string;
}, trx: TransactionClient): Promise<boolean> {
  if (!params.phoneNormalized || !/^\d{8,15}$/.test(params.phoneNormalized)) return false;
  const values = [
    { name: "businessId", type: sql.UniqueIdentifier, value: params.businessId },
    { name: "channelConnectionId", type: sql.UniqueIdentifier, value: params.channelConnectionId },
    { name: "phone", type: sql.NVarChar(32), value: params.phoneNormalized },
    { name: "messageId", type: sql.NVarChar(256), value: params.providerMessageId },
    { name: "evidenceText", type: sql.NVarChar(500), value: params.evidenceText },
  ];
  await trx.execute(
    `MERGE dbo.TblWhatsAppCampaignPermission WITH (HOLDLOCK) AS target
     USING (SELECT @businessId AS BusinessID, @channelConnectionId AS ChannelConnectionID,
       @phone AS PhoneNormalized) AS source
     ON target.BusinessID=source.BusinessID
        AND target.ChannelConnectionID=source.ChannelConnectionID
        AND target.PhoneNormalized=source.PhoneNormalized
     WHEN MATCHED THEN UPDATE SET Source=N'EXPLICIT_INBOUND',
       ProviderMessageID=@messageId, EvidenceText=@evidenceText,
       ConsentedAtUtc=SYSUTCDATETIME()
     WHEN NOT MATCHED THEN INSERT
       (BusinessID,ChannelConnectionID,PhoneNormalized,Source,ProviderMessageID,EvidenceText)
       VALUES (source.BusinessID,source.ChannelConnectionID,source.PhoneNormalized,
         N'EXPLICIT_INBOUND',@messageId,@evidenceText);`,
    values,
  );
  // A fresh, explicit permission can supersede an older STOP. Other messages cannot.
  await trx.execute(
    `DELETE FROM dbo.TblWhatsAppCampaignOptOut
     WHERE BusinessID=@businessId AND ChannelConnectionID=@channelConnectionId
       AND PhoneNormalized=@phone`,
    values.slice(0, 3),
  );
  return true;
}
