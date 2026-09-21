import { z } from "zod";

import { requireApiBusiness } from "@/lib/api/auth-context";
import { handleApiError, jsonError, jsonOk, parseJsonBody } from "@/lib/api/http";
import { structuredLog } from "@/lib/observability/logger";
import {
  isPaymentCheckoutEnabled,
  PAYMENT_GATE_ERROR,
} from "@/modules/billing/payment-provider";
import { createPortalSession } from "@/modules/billing/subscription-lifecycle";

const bodySchema = z.object({
  returnUrl: z.string().url().max(2000),
  businessId: z.string().uuid().optional(),
});

/**
 * Customer billing portal session.
 * Returns 503 EXTERNAL_GATE_PAYMENT_PROVIDER when payments are not configured.
 */
export async function POST(request: Request) {
  try {
    if (!isPaymentCheckoutEnabled()) {
      structuredLog("billing", "billing.portal.gated", {});
      return jsonError("Payment provider is not configured", 503, {
        code: PAYMENT_GATE_ERROR,
      });
    }

    const raw = await parseJsonBody(request);
    const body = bodySchema.parse(raw);
    const { businessId } = await requireApiBusiness({
      businessId: body.businessId,
    });

    const session = await createPortalSession({
      businessId,
      returnUrl: body.returnUrl,
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
