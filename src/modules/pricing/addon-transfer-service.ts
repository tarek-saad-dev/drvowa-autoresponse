import { randomUUID } from "node:crypto";
import { sql, withTransaction } from "@/lib/db";
import { getCurrentSubscription, getPlanById } from "@/modules/billing/entitlements";
import { quotePricingV1Addon } from "./addon-quotes";

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
   return existing.recordset[0].OrderID;
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
