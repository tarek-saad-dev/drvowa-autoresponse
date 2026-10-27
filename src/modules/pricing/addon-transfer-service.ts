import { randomUUID } from "node:crypto";
import { normalizeUuid } from "@/lib/ids/uuid";
import { sql, withTransaction } from "@/lib/db";
import { getCurrentSubscription, getPlanById } from "@/modules/billing/entitlements";
import { quotePricingV1Addon } from "./addon-quotes";
import { getPricingV1Addon } from "./pricing-v1-catalog";

/** Internal staging endpoint only; payment verification is not implemented. */
export async function createAddonTransferDraft(input: {
 businessId: string; userId: string; addonCode: string; idempotencyKey: string;
}) {
 if (process.env.NODE_ENV === "production" ||
     process.env.DRVO_PRICING_V1_ADDON_DRAFTS !== "true") throw new Error("ADDON_CHECKOUT_DISABLED");
 const key = input.idempotencyKey.trim();
 if (!key || key.length > 160) throw new Error("INVALID_IDEMPOTENCY_KEY");
 return withTransaction(async trx => {
  const business = await trx.query<{ BusinessID: string }>(
   "SELECT BusinessID FROM dbo.TblBusiness WITH (UPDLOCK,HOLDLOCK) WHERE BusinessID=@b",
   [{name:"b",type:sql.UniqueIdentifier,value:input.businessId}]);
  if (!business.recordset[0]) throw new Error("BUSINESS_NOT_FOUND");
  const existing = await trx.query<{OrderID:string;AddonCode:string}>(
   "SELECT OrderID,AddonCode FROM dbo.TblPricingAddonOrder WHERE BusinessID=@b AND IdempotencyKey=@k",
   [{name:"b",type:sql.UniqueIdentifier,value:input.businessId},
    {name:"k",type:sql.NVarChar(160),value:key}]);
  if (existing.recordset[0]) {
   if (existing.recordset[0].AddonCode !== input.addonCode) throw new Error("DUPLICATE_KEY_CONFLICT");
   return normalizeUuid(existing.recordset[0].OrderID);
  }
  const subscription = await getCurrentSubscription(input.businessId,trx);
  const plan = subscription ? await getPlanById(subscription.planId,trx) : null;
  if (!subscription || subscription.status !== "ACTIVE" || !plan) throw new Error("PAID_PLAN_REQUIRED");
  const quote = quotePricingV1Addon(input.addonCode,plan.code);
  const id = randomUUID();
  await trx.query(
   `INSERT INTO dbo.TblPricingAddonOrder
    (OrderID,BusinessID,AddonCode,Quantity,AmountEgp,CatalogVersion,Status,IdempotencyKey,PaymentReference)
    VALUES(@id,@b,@code,@quantity,@amount,@version,N'DRAFT',@key,@reference)`,
   [{name:"id",type:sql.UniqueIdentifier,value:id},
    {name:"b",type:sql.UniqueIdentifier,value:input.businessId},
    {name:"code",type:sql.NVarChar(64),value:quote.addonCode},
    {name:"quantity",type:sql.Int,value:quote.quantity},
    {name:"amount",type:sql.Decimal(12,2),value:quote.priceEgp},
    {name:"version",type:sql.NVarChar(48),value:quote.catalogVersion},
    {name:"key",type:sql.NVarChar(160),value:key},
    {name:"reference",type:sql.NVarChar(64),value:"ADD-"+id}]);
  return id;
 });
}


/** Staging-only customer transfer declaration; not evidence that funds arrived. */
export async function submitAddonTransfer(input: {
 businessId:string; orderId:string; payerName:string; transferReference:string;
}) {
 if (process.env.NODE_ENV === "production" || process.env.DRVO_PRICING_V1_ADDON_DRAFTS !== "true")
   throw new Error("ADDON_CHECKOUT_DISABLED");
 const payer=input.payerName.trim(), reference=input.transferReference.trim();
 if (!payer || payer.length>160 || !reference || reference.length>160) throw new Error("INVALID_TRANSFER_DETAILS");
 return withTransaction(async trx => {
  const row=await trx.query<{Status:string}>(
   "SELECT Status FROM dbo.TblPricingAddonOrder WITH (UPDLOCK,HOLDLOCK) WHERE OrderID=@id AND BusinessID=@b",
   [{name:"id",type:sql.UniqueIdentifier,value:input.orderId},{name:"b",type:sql.UniqueIdentifier,value:input.businessId}]);
  if (!row.recordset[0]) throw new Error("ORDER_NOT_FOUND");
  if (row.recordset[0].Status === "PENDING") return "PENDING" as const;
  if (row.recordset[0].Status !== "DRAFT") throw new Error("ORDER_NOT_EDITABLE");
  await trx.query(
   `UPDATE dbo.TblPricingAddonOrder SET Status=N'PENDING',PayerName=@payer,
   TransferReference=@reference,SubmittedAtUtc=SYSUTCDATETIME()
   WHERE OrderID=@id AND BusinessID=@b AND Status=N'DRAFT'`,
   [{name:"id",type:sql.UniqueIdentifier,value:input.orderId},{name:"b",type:sql.UniqueIdentifier,value:input.businessId},
    {name:"payer",type:sql.NVarChar(160),value:payer},{name:"reference",type:sql.NVarChar(160),value:reference}]);
  return "PENDING" as const;
 });
}

/** Internal reviewer action. Authorisation and genuine transfer verification REQUIRED at caller. */
export async function reviewAddonTransfer(input:{
 orderId:string; reviewerUserId:string; decision:"APPROVED"|"REJECTED";
}) {
 if (process.env.NODE_ENV === "production" || process.env.DRVO_PRICING_V1_ADDON_DRAFTS !== "true")
   throw new Error("ADDON_REVIEW_DISABLED");
 return withTransaction(async trx => {
  const row=await trx.query<{Status:string;BusinessID:string;AddonCode:string;Quantity:number;AmountEgp:number}>(
   "SELECT Status,BusinessID,AddonCode,Quantity,AmountEgp FROM dbo.TblPricingAddonOrder WITH (UPDLOCK,HOLDLOCK) WHERE OrderID=@id",
   [{name:"id",type:sql.UniqueIdentifier,value:input.orderId}]);
  if (!row.recordset[0]) throw new Error("ORDER_NOT_FOUND");
  if (row.recordset[0].Status === input.decision) return input.decision;
  if (row.recordset[0].Status !== "PENDING") throw new Error("ORDER_NOT_PENDING");
  if (input.decision === "APPROVED") {
    const order = row.recordset[0];
    const approvedAddon = getPricingV1Addon(order.AddonCode);
    if (!approvedAddon || order.Quantity !== approvedAddon.quantity
        || Number(order.AmountEgp) !== approvedAddon.priceEgp) {
      throw new Error("ADDON_ORDER_CATALOG_MISMATCH");
    }
    const entitlementId = randomUUID();
    const now = new Date();
    const expires = "validDays" in approvedAddon
      ? new Date(now.getTime() + approvedAddon.validDays * 86400000) : null;
    await trx.query(
      `INSERT dbo.TblPricingAddonEntitlement
       (EntitlementID,OrderID,BusinessID,AddonCode,Unit,GrantedQuantity,RemainingQuantity,ValidFromUtc,ExpiresAtUtc)
       VALUES(@e,@o,@b,@code,@unit,@qty,@qty,@now,@expires)`,
      [
       {name:"e",type:sql.UniqueIdentifier,value:entitlementId},
       {name:"o",type:sql.UniqueIdentifier,value:input.orderId},
       {name:"b",type:sql.UniqueIdentifier,value:order.BusinessID},
       {name:"code",type:sql.NVarChar(64),value:order.AddonCode},
       {name:"unit",type:sql.NVarChar(32),value:approvedAddon.unit},
       {name:"qty",type:sql.Int,value:approvedAddon.quantity},
       {name:"now",type:sql.DateTime2(3),value:now},
       {name:"expires",type:sql.DateTime2(3),value:expires}
      ]
    );
  }
  await trx.query(
   `UPDATE dbo.TblPricingAddonOrder SET Status=@decision,ReviewedByUserID=@reviewer,
    ReviewedAtUtc=SYSUTCDATETIME() WHERE OrderID=@id AND Status=N'PENDING'`,
   [{name:"id",type:sql.UniqueIdentifier,value:input.orderId},
    {name:"decision",type:sql.NVarChar(20),value:input.decision},
    {name:"reviewer",type:sql.UniqueIdentifier,value:input.reviewerUserId}]);
  // Approval and the uniquely keyed entitlement grant commit atomically.
  return input.decision;
 });
}
