import { query, sql, type TransactionClient } from "@/lib/db";
import { ValidationError } from "@/lib/tenancy/errors";

export type BillingInterval = "MONTHLY" | "ANNUAL";
export type DiscountQuote = {
  code: string;
  subtotalMinor: number;
  discountMinor: number;
  amountMinor: number;
};

export function normalizeDiscountCode(value: string): string {
  const code = value.trim().toUpperCase();
  if (!/^[A-Z0-9_-]{3,32}$/.test(code)) {
    throw new ValidationError("كود الخصم غير صحيح");
  }
  return code;
}

/**
 * Server-only price calculation: never trust the requested discount or final
 * amount from the browser. A held transaction must own the coupon row lock
 * before creation of the payment intent.
 */
export async function quoteDiscount(input: {
  code: string;
  planCode: string;
  billingInterval: BillingInterval;
  subtotalMinor: number;
  businessId: string;
}, trx?: TransactionClient, options?: { ignoreOwnAwaitingTransfer?: boolean }): Promise<DiscountQuote> {
  const code = normalizeDiscountCode(input.code);
  const runner = trx ? trx.query.bind(trx) : query;
  const result = await runner<{
    Kind: "PERCENT" | "FIXED"; Value: number; MaxRedemptions: number | null;
    StartsAtUtc: Date | null; ExpiresAtUtc: Date | null;
    PlanCode: string | null; BillingInterval: string | null; IsActive: boolean;
  }>(`SELECT Kind,Value,MaxRedemptions,StartsAtUtc,ExpiresAtUtc,
      PlanCode,BillingInterval,IsActive
     FROM dbo.TblPricingDiscountCode ${trx ? "WITH (UPDLOCK,HOLDLOCK)" : ""}
     WHERE Code=@code`,
    [{ name: "code", type: sql.NVarChar(32), value: code }]);
  const coupon = result.recordset[0];
  const now = Date.now();
  if (!coupon || !coupon.IsActive ||
    (coupon.StartsAtUtc && new Date(coupon.StartsAtUtc).getTime() > now) ||
    (coupon.ExpiresAtUtc && new Date(coupon.ExpiresAtUtc).getTime() <= now)) {
    throw new ValidationError("الكود غير متاح أو انتهت صلاحيته");
  }
  if (coupon.PlanCode && coupon.PlanCode !== input.planCode) {
    throw new ValidationError("الكود غير صالح للباقة المختارة");
  }
  if (coupon.BillingInterval && coupon.BillingInterval !== input.billingInterval) {
    throw new ValidationError("الكود غير صالح لمدة الاشتراك المختارة");
  }
  if (!Number.isSafeInteger(input.subtotalMinor) || input.subtotalMinor < 100) {
    throw new ValidationError("قيمة الاشتراك غير صالحة");
  }
  const reserved = await runner<{Total:number;TenantTotal:number}>(`
    SELECT COUNT(*) AS Total,
      COALESCE(SUM(CASE WHEN BusinessID=@businessId THEN 1 ELSE 0 END),0) AS TenantTotal
    FROM dbo.TblManualPaymentRequest
    WHERE DiscountCode=@code AND Status IN (N'AWAITING_TRANSFER',N'PENDING',N'APPROVED')
    ${options?.ignoreOwnAwaitingTransfer ? "AND NOT (BusinessID=@businessId AND Status=N'AWAITING_TRANSFER')" : ""}`,
    [{ name:"code",type:sql.NVarChar(32),value:code },
     { name:"businessId",type:sql.UniqueIdentifier,value:input.businessId }]);
  if (Number(reserved.recordset[0]?.TenantTotal ?? 0) > 0) {
    throw new ValidationError("تم استخدام هذا الكود لهذا النشاط من قبل");
  }
  if (coupon.MaxRedemptions !== null &&
    Number(reserved.recordset[0]?.Total ?? 0) >= coupon.MaxRedemptions) {
    throw new ValidationError("انتهى عدد مرات استخدام الكود");
  }
  const value = Number(coupon.Value);
  if (!Number.isFinite(value) || value <= 0) throw new ValidationError("قيمة الخصم غير صحيحة");
  const discountMinor = coupon.Kind === "PERCENT"
    ? Math.round(input.subtotalMinor * value / 100)
    : Math.round(value * 100);
  if (coupon.Kind === "PERCENT" && value > 90) {
    throw new ValidationError("نسبة الخصم غير مسموح بها");
  }
  if (discountMinor <= 0 || discountMinor > input.subtotalMinor - 100) {
    throw new ValidationError("قيمة الخصم أكبر من المسموح لهذه الباقة");
  }
  return {
    code,
    subtotalMinor: input.subtotalMinor,
    discountMinor,
    amountMinor: input.subtotalMinor - discountMinor,
  };
}
