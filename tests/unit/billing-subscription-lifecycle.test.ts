import { beforeEach, describe, expect, it, vi } from "vitest";

const tryInsertWebhookEvent = vi.fn();
const findSubscriptionByExternalId = vi.fn();
const getSubscriptionByBusinessId = vi.fn();
const getPlanByCode = vi.fn();
const updateSubscriptionBillingFields = vi.fn();
const digestWebhookPayload = vi.fn(() => "digest");

vi.mock("@/modules/billing/repository", () => ({
  tryInsertWebhookEvent,
  findSubscriptionByExternalId,
  getSubscriptionByBusinessId,
  getPlanByCode,
  updateSubscriptionBillingFields,
  digestWebhookPayload,
}));

vi.mock("@/lib/observability/logger", () => ({
  structuredLog: vi.fn(),
}));

vi.mock("@/modules/billing/payment-provider", async () => {
  const actual = await vi.importActual<
    typeof import("@/modules/billing/payment-provider")
  >("@/modules/billing/payment-provider");
  return {
    ...actual,
    getPaymentProvider: () => ({
      name: "test-provider",
      createCheckout: vi.fn(),
      createPortal: vi.fn(),
      verifyWebhook: vi.fn(),
    }),
  };
});

describe("subscription lifecycle webhook idempotency", () => {
  beforeEach(() => {
    tryInsertWebhookEvent.mockReset();
    findSubscriptionByExternalId.mockReset();
    getSubscriptionByBusinessId.mockReset();
    getPlanByCode.mockReset();
    updateSubscriptionBillingFields.mockReset();
    digestWebhookPayload.mockReset();
    digestWebhookPayload.mockReturnValue("digest");
  });

  it("returns duplicate without updating subscription on replay", async () => {
    tryInsertWebhookEvent.mockResolvedValue({
      inserted: false,
      duplicate: true,
    });

    const { applyVerifiedWebhook } = await import(
      "@/modules/billing/subscription-lifecycle"
    );

    const result = await applyVerifiedWebhook(
      {
        ok: true,
        providerEventId: "evt_1",
        eventType: "invoice.paid",
        externalSubscriptionId: "sub_ext",
        mappedStatus: "ACTIVE",
      },
      { providerName: "test-provider", rawBody: "{}" },
    );

    expect(result).toEqual({ status: "duplicate" });
    expect(updateSubscriptionBillingFields).not.toHaveBeenCalled();
    expect(findSubscriptionByExternalId).not.toHaveBeenCalled();
  });

  it("applies activate once when insert succeeds", async () => {
    tryInsertWebhookEvent.mockResolvedValue({
      inserted: true,
      billingWebhookEventId: "wh_1",
    });
    findSubscriptionByExternalId.mockResolvedValue({
      subscriptionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      businessId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      planId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      status: "ACTIVE",
      periodStartUtc: null,
      periodEndUtc: null,
      createdAtUtc: new Date(),
      updatedAtUtc: new Date(),
    });
    getPlanByCode.mockResolvedValue({
      planId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      code: "PRO",
      displayName: "Pro",
      status: "ACTIVE",
      createdAtUtc: new Date(),
      updatedAtUtc: new Date(),
    });
    updateSubscriptionBillingFields.mockResolvedValue(undefined);

    const { applyVerifiedWebhook } = await import(
      "@/modules/billing/subscription-lifecycle"
    );

    const result = await applyVerifiedWebhook(
      {
        ok: true,
        providerEventId: "evt_2",
        eventType: "customer.subscription.updated",
        externalSubscriptionId: "sub_ext",
        externalCustomerId: "cus_1",
        planCode: "PRO",
        mappedStatus: "ACTIVE",
      },
      { providerName: "test-provider", rawBody: "{\"id\":\"evt_2\"}" },
    );

    expect(result).toEqual({
      status: "applied",
      subscriptionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    });
    expect(updateSubscriptionBillingFields).toHaveBeenCalledWith(
      expect.objectContaining({
        subscriptionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        status: "ACTIVE",
        planId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        externalCustomerId: "cus_1",
        externalSubscriptionId: "sub_ext",
      }),
    );
  });
});
