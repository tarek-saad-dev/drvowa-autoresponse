import { z } from "zod";

import { handleApiError, jsonOk, parseJsonBody } from "@/lib/api/http";
import {
  approveManualPayment,
  getPaymentRequestById,
  rejectManualPayment,
} from "@/modules/billing/manual-payment-service";
import { requirePlatformAdmin } from "@/modules/platform-admin/service";
import { NotFoundError } from "@/lib/tenancy/errors";

type RouteContext = { params: Promise<{ paymentRequestId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    await requirePlatformAdmin();
    const { paymentRequestId } = await context.params;
    const payment = await getPaymentRequestById(paymentRequestId);
    if (!payment) throw new NotFoundError("طلب الدفع غير موجود");
    return jsonOk({ payment });
  } catch (error) {
    return handleApiError(error);
  }
}

const actionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("approve"),
    reviewNote: z.string().max(1000).optional().nullable(),
  }),
  z.object({
    action: z.literal("reject"),
    reviewNote: z.string().max(1000).optional().nullable(),
  }),
]);

export async function POST(request: Request, context: RouteContext) {
  try {
    const admin = await requirePlatformAdmin();
    const { paymentRequestId } = await context.params;
    const body = actionSchema.parse(await parseJsonBody(request));

    if (body.action === "approve") {
      const result = await approveManualPayment({
        paymentRequestId,
        reviewerUserId: admin.userId,
        reviewNote: body.reviewNote,
      });
      return jsonOk({
        alreadyApproved: result.alreadyApproved,
        paymentReference: result.payment.paymentReference,
        status: result.payment.status,
        subscriptionId: result.subscription.subscriptionId,
        periodEndUtc: result.subscription.periodEndUtc,
      });
    }

    const rejected = await rejectManualPayment({
      paymentRequestId,
      reviewerUserId: admin.userId,
      reviewNote: body.reviewNote,
    });
    return jsonOk({
      paymentReference: rejected.paymentReference,
      status: rejected.status,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
