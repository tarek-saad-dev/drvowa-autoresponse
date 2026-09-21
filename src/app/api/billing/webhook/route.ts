import { handleApiError, jsonError, jsonOk } from "@/lib/api/http";
import { structuredLog } from "@/lib/observability/logger";
import { getPaymentProvider } from "@/modules/billing/payment-provider";
import { applyVerifiedWebhook } from "@/modules/billing/subscription-lifecycle";

function readSignatureHeader(request: Request): string | null {
  return (
    request.headers.get("stripe-signature")
    ?? request.headers.get("x-payment-signature")
    ?? request.headers.get("x-signature")
  );
}

/**
 * Provider webhook ingress — raw body + signature header.
 * 200 on applied/duplicate; 400/401 on bad signature / unverified payload.
 */
export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    const signatureHeader = readSignatureHeader(request);
    const provider = getPaymentProvider();

    const verified = await provider.verifyWebhook(rawBody, signatureHeader);
    if (!verified.ok) {
      structuredLog("billing", "billing.webhook.rejected", {
        providerName: provider.name,
        hasSignature: Boolean(signatureHeader),
      });
      return jsonError("Invalid webhook signature", signatureHeader ? 400 : 401, {
        code: "WEBHOOK_SIGNATURE_INVALID",
      });
    }

    const applied = await applyVerifiedWebhook(verified, {
      providerName: provider.name,
      rawBody,
    });

    if (applied.status === "failed") {
      return jsonError(applied.reason, 400, { code: applied.reason });
    }

    return jsonOk({
      ok: true,
      status: applied.status,
      subscriptionId:
        applied.status === "applied" ? applied.subscriptionId : undefined,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
