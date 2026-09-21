import { z } from "zod";

import { requireApiBusiness } from "@/lib/api/auth-context";
import { handleApiError, jsonOk, parseJsonBody } from "@/lib/api/http";
import {
  getBusinessPaymentStatus,
  getPaymentInstructions,
  submitManualPaymentRequest,
} from "@/modules/billing/manual-payment-service";
import { isManualInstaPayEnabled } from "@/modules/billing/instapay-config";

export async function GET() {
  try {
    const { businessId } = await requireApiBusiness();
    const [status, instructions] = await Promise.all([
      getBusinessPaymentStatus({ businessId }),
      isManualInstaPayEnabled()
        ? getPaymentInstructions()
        : Promise.resolve(null),
    ]);
    return jsonOk({
      enabled: isManualInstaPayEnabled(),
      instructions,
      pending: status.pending
        ? {
            paymentReference: status.pending.paymentReference,
            amount: status.pending.amount,
            currencyCode: status.pending.currencyCode,
            status: status.pending.status,
            submittedAtUtc: status.pending.submittedAtUtc,
            planDisplayName: status.requestedPlan?.displayName ?? null,
            planCode: status.requestedPlan?.code ?? null,
          }
        : null,
      latest: status.latest
        ? {
            paymentReference: status.latest.paymentReference,
            amount: status.latest.amount,
            currencyCode: status.latest.currencyCode,
            status: status.latest.status,
            submittedAtUtc: status.latest.submittedAtUtc,
            reviewedAtUtc: status.latest.reviewedAtUtc,
            reviewNote:
              status.latest.status === "REJECTED"
                ? status.latest.reviewNote
                : null,
            planDisplayName: status.requestedPlan?.displayName ?? null,
            planCode: status.requestedPlan?.code ?? null,
          }
        : null,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

const submitSchema = z.object({
  planCode: z.string().min(1).max(32),
  payerName: z.string().min(1).max(160),
  transferReference: z.string().max(160).optional().nullable(),
  customerNote: z.string().max(1000).optional().nullable(),
});

export async function POST(request: Request) {
  try {
    const { businessId, user } = await requireApiBusiness();
    const body = submitSchema.parse(await parseJsonBody(request));
    const created = await submitManualPaymentRequest({
      businessId,
      userId: user.userId,
      planCode: body.planCode,
      payerName: body.payerName,
      transferReference: body.transferReference,
      customerNote: body.customerNote,
    });
    return jsonOk(
      {
        paymentReference: created.paymentReference,
        amount: created.amount,
        currencyCode: created.currencyCode,
        status: created.status,
        submittedAtUtc: created.submittedAtUtc,
      },
      { status: 201 },
    );
  } catch (error) {
    return handleApiError(error);
  }
}
