import { query, sql } from "@/lib/db";
import { normalizeErpCustomerPhone } from "./erp-phone";
import * as repo from "./repository";

const POS_EVIDENCE = "STAFF_CONFIRMED_CUSTOMER_WHATSAPP_OFFERS";

/** Import only actual evidenced consent captured at Cashier registration.
 * The evidence must belong to this exact ERP client and the unchanged phone.
 * Unknown/old Cashier rows, removed consent, contact number edits, or
 * businesses with multiple active WhatsApp channels remain unconsented.
 * This does NOT delete WhatsApp opt-outs or start a campaign.
 */
export async function importCashierWhatsAppOffersConsent(params: {
  businessId: string;
  customerId: string;
  externalClientId: string;
  mobile: string | null;
  phone: string | null;
  proofPhone: string | null;
  consentedAtUtc: string | null;
  evidence: string | null;
}): Promise<boolean> {
  if (!params.externalClientId || params.evidence !== POS_EVIDENCE ||
      !params.proofPhone || !params.consentedAtUtc) return false;
  const current = normalizeErpCustomerPhone(params.mobile, params.phone);
  const proved = normalizeErpCustomerPhone(params.proofPhone, null);
  if (!current || current !== proved) return false;
  const timestamp = Date.parse(params.consentedAtUtc);
  if (!Number.isFinite(timestamp) || timestamp <= 0 ||
      timestamp > Date.now() + 60_000) return false;

  // Never grant permission on a different CRM customer's shared/reused phone.
  const phoneOwner = await repo.getCustomerByPhone({
    businessId: params.businessId, phoneNormalized: proved,
  });
  if (!phoneOwner || phoneOwner.customerId !== params.customerId) return false;

  // Unambiguous, active channel only. More than one WhatsApp channel requires
  // a future explicit integration-to-channel mapping, not a blanket grant.
  const channels = await query<{ ChannelConnectionID: string }>(
    `SELECT TOP (2) ChannelConnectionID FROM dbo.TblChannelConnection
     WHERE BusinessID=@businessId AND Channel=N'WHATSAPP'
       AND IsActive=1 AND Status=N'ACTIVE'
     ORDER BY ChannelConnectionID`,
    [{name:"businessId",type:sql.UniqueIdentifier,value:params.businessId}],
  );
  if (channels.recordset.length !== 1) return false;
  const channelId = channels.recordset[0]!.ChannelConnectionID;
  const consentDate = new Date(timestamp);

  // Durable, idempotent, channel-scoped evidence. Preserve existing
  // inbound proof; never remove a STOP entry even if Cashier re-imports.
  await query(
    `MERGE dbo.TblWhatsAppCampaignPermission WITH (HOLDLOCK) AS target
     USING (SELECT @businessId AS BusinessID,
                   @channelId AS ChannelConnectionID,
                   @phone AS PhoneNormalized) AS source
       ON target.BusinessID=source.BusinessID
         AND target.ChannelConnectionID=source.ChannelConnectionID
         AND target.PhoneNormalized=source.PhoneNormalized
     WHEN MATCHED AND target.Source=N'EXPLICIT_POS_REGISTRATION'
          AND target.ConsentedAtUtc < @at
       THEN UPDATE SET ConsentedAtUtc=@at,
         ProviderMessageID=@proofId, EvidenceText=@proofText
     WHEN NOT MATCHED THEN INSERT
       (BusinessID,ChannelConnectionID,PhoneNormalized,Source,
        ProviderMessageID,EvidenceText,ConsentedAtUtc)
       VALUES (source.BusinessID,source.ChannelConnectionID,
         source.PhoneNormalized,N'EXPLICIT_POS_REGISTRATION',
         @proofId,@proofText,@at);`,
    [
      {name:"businessId",type:sql.UniqueIdentifier,value:params.businessId},
      {name:"channelId",type:sql.UniqueIdentifier,value:channelId},
      {name:"phone",type:sql.NVarChar(32),value:proved},
      {name:"at",type:sql.DateTime2,value:consentDate},
      {name:"proofId",type:sql.NVarChar(256),value:`CASHIER:${params.externalClientId}`},
      {name:"proofText",type:sql.NVarChar(500),
       value:`Cashier staff recorded explicit WhatsApp offers permission for ERP client ${params.externalClientId} at ${consentDate.toISOString()}`},
    ],
  );
  return true;
}
