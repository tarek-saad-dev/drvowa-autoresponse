import { z } from "zod";
import { requireApiBusiness } from "@/lib/api/auth-context";
import { handleApiError, jsonOk, parseJsonBody } from "@/lib/api/http";
import { requireBusinessMembership } from "@/lib/tenancy/require-membership";
import { ForbiddenError } from "@/lib/tenancy/errors";
import { createAddonTransferDraft, submitAddonTransfer } from "@/modules/pricing/addon-transfer-service";
import { query, sql } from "@/lib/db";

const schema = z.discriminatedUnion("action", [
 z.object({ action: z.literal("create"), addonCode: z.string().min(1).max(64), idempotencyKey: z.string().min(1).max(160) }),
 z.object({ action: z.literal("confirm"), orderId: z.string().uuid(), payerName: z.string().min(1).max(160), transferReference: z.string().min(1).max(160) }),
]);

function checkEnabled() {
 if (process.env.NODE_ENV === "production" || process.env.DRVO_PRICING_V1_ADDON_DRAFTS !== "true") {
  throw new ForbiddenError("شراء الإضافات غير متاح حاليًا");
 }
}
async function ownerOrAdmin(userId: string, businessId: string) {
 const membership = await requireBusinessMembership(userId,businessId);
 if (membership.role !== "OWNER" && membership.role !== "ADMIN") throw new ForbiddenError("إدارة الدفع متاحة لمالك النشاط أو المدير فقط");
}
export async function GET() {
 try {
  checkEnabled();
  const {user,businessId} = await requireApiBusiness();
  await ownerOrAdmin(user.userId,businessId);
  const result = await query<{OrderID:string;AddonCode:string;Quantity:number;AmountEgp:number;Status:string;PaymentReference:string|null}>(
   `SELECT TOP 25 OrderID,AddonCode,Quantity,AmountEgp,Status,PaymentReference
    FROM dbo.TblPricingAddonOrder WHERE BusinessID=@b ORDER BY CreatedAtUtc DESC`,
   [{name:"b",type:sql.UniqueIdentifier,value:businessId}],
  );
  return jsonOk({ orders: result.recordset });
 } catch(error) { return handleApiError(error); }
}
export async function POST(request: Request) {
 try {
  checkEnabled();
  const {user,businessId} = await requireApiBusiness();
  await ownerOrAdmin(user.userId,businessId);
  const data = schema.parse(await parseJsonBody(request));
  if (data.action === "create") {
   const orderId = await createAddonTransferDraft({
    businessId,userId:user.userId,addonCode:data.addonCode,idempotencyKey:data.idempotencyKey,
   });
   return jsonOk({orderId,status:"DRAFT"}, {status:201});
  }
  const status = await submitAddonTransfer({
   businessId,orderId:data.orderId,payerName:data.payerName,transferReference:data.transferReference,
  });
  return jsonOk({orderId:data.orderId,status});
 } catch(error) { return handleApiError(error); }
}
