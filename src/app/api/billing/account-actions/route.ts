import { z } from "zod";
import { requireApiBusiness } from "@/lib/api/auth-context";
import { handleApiError, jsonOk, parseJsonBody } from "@/lib/api/http";
import { requireBusinessMembership } from "@/lib/tenancy/require-membership";
import { ForbiddenError } from "@/lib/tenancy/errors";
import { requestCustomerRefund, setCustomerCancellation } from "@/modules/billing/customer-account-actions";

const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("request_refund"),
    paymentRequestId: z.string().uuid(),
    reason: z.string().trim().min(8).max(1000),
  }),
  z.object({ action: z.literal("schedule_cancel") }),
  z.object({ action: z.literal("undo_cancel") }),
]);

export async function POST(request: Request) {
  try {
    const { businessId, user } = await requireApiBusiness();
    const member = await requireBusinessMembership(user.userId, businessId);
    if (member.role !== "OWNER" && member.role !== "ADMIN") {
      throw new ForbiddenError("إجراءات الاشتراك والاسترداد متاحة لمالك النشاط أو المدير فقط.");
    }
    const input = schema.parse(await parseJsonBody(request));
    if (input.action === "request_refund") {
      const result = await requestCustomerRefund({
        businessId, actorUserId: user.userId,
        paymentRequestId: input.paymentRequestId, reason: input.reason,
      });
      return jsonOk(result, { status: 202 });
    }
    return jsonOk(await setCustomerCancellation({
      businessId, actorUserId: user.userId, action: input.action,
    }));
  } catch (error) {
    return handleApiError(error);
  }
}
