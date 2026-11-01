import { z } from "zod";
import { query, sql } from "@/lib/db";
import { requirePlatformAdmin } from "@/modules/platform-admin/service";
import { handleApiError, jsonOk, parseJsonBody } from "@/lib/api/http";
import { normalizeDiscountCode } from "@/modules/pricing/discount-codes";
import { ConflictError, ValidationError } from "@/lib/tenancy/errors";

const create = z.object({
  action: z.literal("create"),
  code: z.string().min(3).max(32),
  partnerDisplayName: z.string().trim().max(80).optional().nullable(),
  kind: z.enum(["PERCENT","FIXED"]),
  value: z.number().positive().max(100000),
  maxRedemptions: z.number().int().positive().max(100000).nullable(),
  planCode: z.enum(["STARTER","PRO","BUSINESS"]).nullable(),
  billingInterval: z.enum(["MONTHLY","ANNUAL"]).nullable(),
  startsAtUtc: z.string().datetime().nullable(),
  expiresAtUtc: z.string().datetime().nullable(),
});
const toggle = z.object({
  action: z.literal("toggle"),
  code: z.string().min(3).max(32),
  active: z.boolean(),
});
const schema = z.discriminatedUnion("action",[create,toggle]);

export async function GET() {
  try {
    await requirePlatformAdmin();
    const { recordset }=await query(`SELECT TOP (200) c.Code,c.PartnerDisplayName,c.Kind,c.Value,c.MaxRedemptions,
      c.StartsAtUtc,c.ExpiresAtUtc,c.PlanCode,c.BillingInterval,c.IsActive,c.CreatedAtUtc,
      (SELECT COUNT(*) FROM dbo.TblManualPaymentRequest p
        WHERE p.DiscountCode=c.Code AND p.Status IN (N'AWAITING_TRANSFER',N'PENDING',N'APPROVED')) AS Reserved,
      (SELECT COUNT(*) FROM dbo.TblManualPaymentRequest p
        WHERE p.DiscountCode=c.Code AND p.Status=N'APPROVED') AS Redeemed
      FROM dbo.TblPricingDiscountCode c ORDER BY c.CreatedAtUtc DESC`);
    return jsonOk({ codes: recordset });
  } catch(error) { return handleApiError(error); }
}

export async function POST(request:Request) {
  try {
    const admin = await requirePlatformAdmin();
    const body=schema.parse(await parseJsonBody(request));
    const code=normalizeDiscountCode(body.code);
    if(body.action==="toggle") {
      const result=await query<{Code:string}>(`UPDATE dbo.TblPricingDiscountCode
         SET IsActive=@active OUTPUT inserted.Code WHERE Code=@code`,
         [{name:"code",type:sql.NVarChar(32),value:code},
          {name:"active",type:sql.Bit,value:body.active}]);
      if(!result.recordset.length) throw new ValidationError("الكود غير موجود");
      return jsonOk({code,active:body.active});
    }
    if(body.kind==="PERCENT" && body.value>90)
      throw new ValidationError("أقصى نسبة خصم بالكود 90%");
    if(Math.round(body.value*100)!==body.value*100 && body.kind==="FIXED")
      throw new ValidationError("مبلغ الخصم يقبل رقمين عشريين فقط");
    if(body.startsAtUtc && body.expiresAtUtc &&
       Date.parse(body.startsAtUtc)>=Date.parse(body.expiresAtUtc))
      throw new ValidationError("تاريخ الانتهاء لازم يكون بعد البداية");
    if(body.expiresAtUtc && Date.parse(body.expiresAtUtc)<=Date.now())
      throw new ValidationError("انتهاء الصلاحية لازم يكون في المستقبل");
    const exists=await query<{Code:string}>(`SELECT Code FROM dbo.TblPricingDiscountCode WHERE Code=@code`,
      [{name:"code",type:sql.NVarChar(32),value:code}]);
    if(exists.recordset.length) throw new ConflictError("كود الخصم موجود بالفعل");
    await query(`INSERT dbo.TblPricingDiscountCode
      (Code,PartnerDisplayName,Kind,Value,MaxRedemptions,StartsAtUtc,ExpiresAtUtc,PlanCode,BillingInterval,CreatedByUserID)
      VALUES(@code,@partner,@kind,@value,@max,@start,@end,@plan,@interval,@user)`,[
      {name:"code",type:sql.NVarChar(32),value:code},
      {name:"partner",type:sql.NVarChar(80),value:body.partnerDisplayName?.trim()||null},
      {name:"kind",type:sql.NVarChar(10),value:body.kind},
      {name:"value",type:sql.Decimal(12,2),value:body.value},
      {name:"max",type:sql.Int,value:body.maxRedemptions},
      {name:"start",type:sql.DateTime2(3),value:body.startsAtUtc ? new Date(body.startsAtUtc):null},
      {name:"end",type:sql.DateTime2(3),value:body.expiresAtUtc ? new Date(body.expiresAtUtc):null},
      {name:"plan",type:sql.NVarChar(32),value:body.planCode},
      {name:"interval",type:sql.NVarChar(10),value:body.billingInterval},
      {name:"user",type:sql.UniqueIdentifier,value:admin.userId},
    ]);
    return jsonOk({code,active:true},{status:201});
  } catch(error) {return handleApiError(error);}
}
