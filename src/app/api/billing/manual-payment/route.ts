import { z } from "zod";

import { requireApiBusiness } from "@/lib/api/auth-context";
import { handleApiError, jsonOk, parseJsonBody } from "@/lib/api/http";
import {
  confirmManualPaymentTransfer,
  createManualPaymentIntent,
  getBusinessPaymentStatus,
  getPaymentInstructions,
} from "@/modules/billing/manual-payment-service";
import { isManualInstaPayEnabled } from "@/modules/billing/instapay-config";

function serializePayment(p: {
  paymentRequestId: string;
  paymentReference: string;
  amount: number;
  currencyCode: string;
  status: string;
  submittedAtUtc: Date | null;
  reviewedAtUtc?: Date | null;
  reviewNote?: string | null;
  requestedPlanCode: string;
  requestedPlanDisplayName: string;
  payerName?: string | null;
}) {
  return {
    paymentRequestId: p.paymentRequestId,
    paymentReference: p.paymentReference,
    amount: p.amount,
    currencyCode: p.currencyCode,
    status: p.status,
    submittedAtUtc: p.submittedAtUtc,
    reviewedAtUtc: p.reviewedAtUtc ?? null,
    reviewNote: p.status === "REJECTED" ? (p.reviewNote ?? null) : null,
    planDisplayName: p.requestedPlanDisplayName,
    planCode: p.requestedPlanCode,
    payerName: p.payerName ?? null,
  };
}

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
      open: status.open ? serializePayment(status.open) : null,
      pending: status.pending ? serializePayment(status.pending) : null,
      latest: status.latest ? serializePayment(status.latest) : null,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

const createIntentSchema = z.object({
  action: z.literal("create_intent").optional().default("create_intent"),
  planCode: z.string().min(1).max(32),
});

const confirmSchema = z.object({
  action: z.literal("confirm_transfer"),
  paymentRequestId: z.string().uuid(),
  payerName: z.string().min(1).max(160),
  transferReference: z.string().max(160).optional().nullable(),
  customerNote: z.string().max(1000).optional().nullable(),
});

const postSchema = z.union([confirmSchema, createIntentSchema]);

export async function POST(request: Request) {
  try {
    const { businessId, user } = await requireApiBusiness();
    const body = postSchema.parse(await parseJsonBody(request));

    if (body.action === "confirm_transfer") {
      const confirmed = await confirmManualPaymentTransfer({
        businessId,
        userId: user.userId,
        paymentRequestId: body.paymentRequestId,
        payerName: body.payerName,
        transferReference: body.transferReference,
        customerNote: body.customerNote,
      });
      return jsonOk(serializePayment(confirmed));
    }

    const created = await createManualPaymentIntent({
      businessId,
      userId: user.userId,
      planCode: body.planCode,
    });
    return jsonOk(serializePayment(created), { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
