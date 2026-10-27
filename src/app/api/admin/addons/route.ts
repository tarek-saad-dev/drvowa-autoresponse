import { z } from "zod";
import { query, sql } from "@/lib/db";
import { handleApiError, jsonOk, parseJsonBody } from "@/lib/api/http";
import { requirePlatformAdmin } from "@/modules/platform-admin/service";
import { reviewAddonTransfer } from "@/modules/pricing/addon-transfer-service";
import { ForbiddenError } from "@/lib/tenancy/errors";

function guard() {
 if (process.env.NODE_ENV === "production" || process.env.DRVO_PRICING_V1_ADDON_DRAFTS !== "true")
  throw new ForbiddenError("مراجعة الإضافات غير مفعلة");
}
const reviewSchema=z.object({
 orderId:z.string().uuid(),
 decision:z.enum(["APPROVED","REJECTED"]),
 verifiedTransfer:z.literal(true),
});
export async function GET() {
 try {
  const admin=await requirePlatformAdmin(); void admin; guard();
  const result=await query<{OrderID:string;BusinessID:string;AddonCode:string;Quantity:number;AmountEgp:number;PaymentReference:string|null;PayerName:string|null;TransferReference:string|null;Status:string}>(
   `SELECT TOP 100 OrderID,BusinessID,AddonCode,Quantity,AmountEgp,PaymentReference,PayerName,TransferReference,Status
     FROM dbo.TblPricingAddonOrder
     WHERE Status=N'PENDING'
     ORDER BY SubmittedAtUtc ASC`,
  );
  return jsonOk({items:result.recordset});
 } catch(error){return handleApiError(error);}
}
export async function POST(request:Request) {
 try {
  const admin=await requirePlatformAdmin(); guard();
  const data=reviewSchema.parse(await parseJsonBody(request));
  const status=await reviewAddonTransfer({
   orderId:data.orderId,reviewerUserId:admin.userId,decision:data.decision
  });
  return jsonOk({status,orderId:data.orderId,entitlementsGranted:status==="APPROVED",financialSettlementRecorded:false});
 } catch(error){return handleApiError(error);}
}
