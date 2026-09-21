import { z } from "zod";

import { requireApiBusiness } from "@/lib/api/auth-context";
import { handleApiError, jsonError, jsonOk, parseJsonBody } from "@/lib/api/http";
import { structuredLog } from "@/lib/observability/logger";
import {
  isPaymentCheckoutEnabled,
  PAYMENT_GATE_ERROR,
} from "@/modules/billing/payment-provider";
import { createCheckoutSession } from "@/modules/billing/subscription-lifecycle";

const bodySchema = z.object({
  planCode: z.string().trim().min(1).max(64),
  successUrl: z.string().url().max(2000),
  cancelUrl: z.string().url().max(2000),
  businessId: z.string().uuid().optional(),
});

/**
 * Start a paid checkout session.
 * Returns 503 EXTERNAL_GATE_PAYMENT_PROVIDER when payments are not configured.
 * Never invents a fake Buy / success URL.
 */
export async function POST(request: Request) {
  try {
    if (!isPaymentCheckoutEnabled()) {
      structuredLog("billing", "billing.checkout.gated", {});
      return jsonError("Payment provider is not configured", 503, {
        code: PAYMENT_GATE_ERROR,
      });
    }

    const raw = await parseJsonBody(request);
    const body = bodySchema.parse(raw);
    const { businessId } = await requireApiBusiness({
      businessId: body.businessId,
    });

    const session = await createCheckoutSession({
      businessId,
      planCode: body.planCode,
      successUrl: body.successUrl,
      cancelUrl: body.cancelUrl,
    });

    return jsonOk(session);
  } catch (error) {
    if (error instanceof Error && error.message === PAYMENT_GATE_ERROR) {
      return jsonError("Payment provider is not configured", 503, {
        code: PAYMENT_GATE_ERROR,
      });
    }
    return handleApiError(error);
  }
}
