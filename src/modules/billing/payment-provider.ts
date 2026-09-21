/**
 * Generic payment provider boundary.
 * No merchant credentials — EXTERNAL_GATE_PAYMENT_PROVIDER / PRICING.
 * Real Stripe/Paymob adapters attach here later; subscription lifecycle stays
 * in billing modules and must not hardcode a vendor.
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

export type MappedSubscriptionStatus =
  | "ACTIVE"
  | "TRIALING"
  | "PAST_DUE"
  | "CANCELED"
  | "INACTIVE"
  | "EXPIRED";

export type WebhookVerificationResult = {
  ok: boolean;
  eventType?: string;
  externalSubscriptionId?: string;
  mappedStatus?: MappedSubscriptionStatus;
  businessId?: string;
  planCode?: string;
  externalCustomerId?: string;
  periodStartUtc?: Date | string;
  periodEndUtc?: Date | string;
  providerEventId?: string;
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

export const PAYMENT_GATE_ERROR = "EXTERNAL_GATE_PAYMENT_PROVIDER";

export class UnconfiguredPaymentProvider implements PaymentProvider {
  readonly name = "unconfigured";

  async createCheckout(): Promise<CheckoutSessionResult> {
    throw new Error(PAYMENT_GATE_ERROR);
  }

  async createPortal(): Promise<PortalSessionResult> {
    throw new Error(PAYMENT_GATE_ERROR);
  }

  async verifyWebhook(): Promise<WebhookVerificationResult> {
    return { ok: false };
  }
}

/**
 * Future adapters (stripe / paymob) register by PAYMENT_PROVIDER name.
 * Until an adapter exists and credentials are present, checkout stays disabled.
 */
function readPaymentProviderName(): string {
  return (process.env.PAYMENT_PROVIDER ?? "").trim().toLowerCase();
}

/**
 * True only when a real checkout adapter is selected AND credentials exist.
 * No real adapters are wired yet — always false (including explicit unconfigured).
 */
export function isPaymentCheckoutEnabled(): boolean {
  const name = readPaymentProviderName();
  if (!name || name === "unconfigured") {
    return false;
  }
  // Structure reserved for stripe/paymob credential checks once adapters ship.
  void name;
  return false;
}

export function getPaymentProvider(): PaymentProvider {
  const name = readPaymentProviderName();
  // Future: if (name === "stripe" && hasStripeCreds()) return new StripePaymentProvider();
  // Future: if (name === "paymob" && hasPaymobCreds()) return new PaymobPaymentProvider();
  void name;
  return new UnconfiguredPaymentProvider();
}
