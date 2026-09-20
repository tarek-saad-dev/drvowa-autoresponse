/**
 * Generic payment provider boundary.
 * No merchant credentials — EXTERNAL_GATE_PAYMENT_PROVIDER / PRICING.
 * Subscription lifecycle remains in billing modules; providers attach here later.
 */

export type CheckoutSessionInput = {
  businessId: string;
  planCode: string;
  successUrl: string;
  cancelUrl: string;
};

export type CheckoutSessionResult = {
  checkoutUrl: string;
  providerSessionId: string;
};

export type PortalSessionInput = {
  businessId: string;
  returnUrl: string;
};

export type PortalSessionResult = {
  portalUrl: string;
};

export type WebhookVerificationResult = {
  ok: boolean;
  eventType?: string;
  externalSubscriptionId?: string;
  mappedStatus?: "ACTIVE" | "TRIALING" | "PAST_DUE" | "CANCELED" | "INACTIVE";
};

export interface PaymentProvider {
  readonly name: string;
  createCheckout(input: CheckoutSessionInput): Promise<CheckoutSessionResult>;
  createPortal(input: PortalSessionInput): Promise<PortalSessionResult>;
  verifyWebhook(
    rawBody: string,
    signatureHeader: string | null,
  ): Promise<WebhookVerificationResult>;
}

export class UnconfiguredPaymentProvider implements PaymentProvider {
  readonly name = "unconfigured";

  async createCheckout(): Promise<CheckoutSessionResult> {
    throw new Error("EXTERNAL_GATE_PAYMENT_PROVIDER");
  }

  async createPortal(): Promise<PortalSessionResult> {
    throw new Error("EXTERNAL_GATE_PAYMENT_PROVIDER");
  }

  async verifyWebhook(): Promise<WebhookVerificationResult> {
    return { ok: false };
  }
}

export function getPaymentProvider(): PaymentProvider {
  return new UnconfiguredPaymentProvider();
}
