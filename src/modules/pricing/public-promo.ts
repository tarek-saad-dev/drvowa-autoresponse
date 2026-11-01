import { query, sql } from "@/lib/db";
import { normalizeDiscountCode } from "@/modules/pricing/discount-codes";

export type PublicPromo = {
  code:string;
  kind:"PERCENT"|"FIXED";
  value:number;
  partnerDisplayName:string|null;
  planCode:string|null;
  billingInterval:"MONTHLY"|"ANNUAL"|null;
  expiresAtUtc:Date|null;
  remaining:number|null;
};

/** No visitor tracking or personally identifiable information. Only live coupons. */
export async function getPublicPromo(rawCode:string):Promise<PublicPromo|null>{
  if(!/^[a-zA-Z0-9_-]{3,32}$/.test(rawCode))return null;
  const code=normalizeDiscountCode(rawCode);
  const res=await query<{
    Code:string;Kind:"PERCENT"|"FIXED";Value:number;
    PartnerDisplayName:string|null;PlanCode:string|null;
    BillingInterval:"MONTHLY"|"ANNUAL"|null;
    ExpiresAtUtc:Date|null;MaxRedemptions:number|null;
    Reserved:number;IsActive:boolean;StartsAtUtc:Date|null;
  }>(`SELECT c.Code,c.Kind,c.Value,c.PartnerDisplayName,c.PlanCode,
      c.BillingInterval,c.ExpiresAtUtc,c.MaxRedemptions,c.IsActive,c.StartsAtUtc,
      (SELECT COUNT(1) FROM dbo.TblManualPaymentRequest p
       WHERE p.DiscountCode=c.Code AND p.Status IN (N'AWAITING_TRANSFER',N'PENDING',N'APPROVED')) AS Reserved
    FROM dbo.TblPricingDiscountCode c
    WHERE c.Code=@code`,[{name:"code",type:sql.NVarChar(32),value:code}]);
  const row=res.recordset[0];
  const now=Date.now();
  if(!row || !row.IsActive ||
    (row.StartsAtUtc && new Date(row.StartsAtUtc).getTime()>now) ||
    (row.ExpiresAtUtc && new Date(row.ExpiresAtUtc).getTime()<=now) ||
    (row.MaxRedemptions!=null && Number(row.Reserved)>=Number(row.MaxRedemptions))){
    return null;
  }
  return {
    code:row.Code,kind:row.Kind,value:Number(row.Value),
    partnerDisplayName:row.PartnerDisplayName,
    planCode:row.PlanCode,billingInterval:row.BillingInterval,
    expiresAtUtc:row.ExpiresAtUtc,
    remaining:row.MaxRedemptions==null?null:Number(row.MaxRedemptions)-Number(row.Reserved),
  };
}

export function previewPromoPrice(params:{
  kind:"PERCENT"|"FIXED";value:number;baseEgp:number;
}):{discountedEgp:number;discountEgp:number}|null{
  const {kind,value,baseEgp}=params;
  if(!Number.isFinite(value)||value<=0 || !Number.isFinite(baseEgp)||baseEgp<=0)return null;
  const originalMinor=Math.round(baseEgp*100);
  const offMinor=kind==="PERCENT"?Math.round(originalMinor*value/100):Math.round(value*100);
  if(offMinor<=0 || offMinor>=originalMinor-99)return null;
  return {discountedEgp:(originalMinor-offMinor)/100,discountEgp:offMinor/100};
}
