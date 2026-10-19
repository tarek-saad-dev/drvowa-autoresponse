import { beforeEach, describe, expect, it, vi } from "vitest";

const tryInsertWebhookEvent = vi.fn();
const finishWebhookEvent = vi.fn();
const transaction = { query: vi.fn(), execute: vi.fn() };
vi.mock("@/lib/db", () => ({ withTransaction: async (fn: (trx: unknown) => Promise<unknown>) => fn(transaction) }));
const findSubscriptionByExternalId = vi.fn();
const getSubscriptionByBusinessId = vi.fn();
const getPlanByCode = vi.fn();
const updateSubscriptionBillingFields = vi.fn();
const digestWebhookPayload = vi.fn(() => "digest");

vi.mock("@/modules/billing/repository", () => ({
  tryInsertWebhookEvent,
  finishWebhookEvent,
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
    finishWebhookEvent.mockReset();
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
      transaction,
    );
  });
});


describe("webhook safety regressions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tryInsertWebhookEvent.mockResolvedValue({ inserted: true, billingWebhookEventId: "wh" });
    findSubscriptionByExternalId.mockResolvedValue({ subscriptionId: "sub", businessId: "business", providerName: "test-provider" });
    updateSubscriptionBillingFields.mockResolvedValue(undefined);
  });
  it("does not infer ACTIVE from invoice.unpaid or arbitrary succeeded events", async () => {
    const { applyVerifiedWebhook } = await import("@/modules/billing/subscription-lifecycle");
    for (const eventType of ["invoice.unpaid", "refund.succeeded", "subscription.created"]) {
      const result = await applyVerifiedWebhook({ ok: true, providerEventId: eventType, externalSubscriptionId: "ext", eventType });
      expect(result.status).toBe("ignored");
    }
    expect(updateSubscriptionBillingFields).not.toHaveBeenCalled();
  });
  it("uses the same transaction for deduplication and subscription update", async () => {
    const { applyVerifiedWebhook } = await import("@/modules/billing/subscription-lifecycle");
    await applyVerifiedWebhook({ ok: true, providerEventId: "evt", externalSubscriptionId: "ext", mappedStatus: "ACTIVE" });
    expect(tryInsertWebhookEvent).toHaveBeenCalledWith(expect.anything(), transaction);
    expect(updateSubscriptionBillingFields).toHaveBeenCalledWith(expect.anything(), transaction);
    expect(finishWebhookEvent).toHaveBeenCalledWith("wh", "APPLIED", null, transaction);
  });
  it("does not fall back to an unrelated business subscription when external ID is missing", async () => {
    findSubscriptionByExternalId.mockResolvedValue(null);
    const { applyVerifiedWebhook } = await import("@/modules/billing/subscription-lifecycle");
    await expect(applyVerifiedWebhook({ ok: true, providerEventId: "missing", externalSubscriptionId: "unknown", businessId: "business", mappedStatus: "ACTIVE" })).rejects.toThrow("SUBSCRIPTION_NOT_FOUND");
    expect(getSubscriptionByBusinessId).not.toHaveBeenCalled();
    expect(updateSubscriptionBillingFields).not.toHaveBeenCalled();
  });
  it("rejects cross-business or cross-provider subscription references", async () => {
    const { applyVerifiedWebhook } = await import("@/modules/billing/subscription-lifecycle");
    await expect(applyVerifiedWebhook({ ok: true, providerEventId: "cross", externalSubscriptionId: "ext", businessId: "other", mappedStatus: "ACTIVE" })).rejects.toThrow("SUBSCRIPTION_IDENTITY_MISMATCH");
    findSubscriptionByExternalId.mockResolvedValue({ subscriptionId: "sub", providerName: "other-provider" });
    await expect(applyVerifiedWebhook({ ok: true, providerEventId: "cross-provider", externalSubscriptionId: "ext", mappedStatus: "ACTIVE" })).rejects.toThrow("SUBSCRIPTION_IDENTITY_MISMATCH");
    expect(updateSubscriptionBillingFields).not.toHaveBeenCalled();
  });
  it("propagates persistence failure so the transaction rolls back and provider retries", async () => {
    updateSubscriptionBillingFields.mockRejectedValue(new Error("write failed"));
    const { applyVerifiedWebhook } = await import("@/modules/billing/subscription-lifecycle");
    await expect(applyVerifiedWebhook({ ok: true, providerEventId: "retry", externalSubscriptionId: "ext", mappedStatus: "ACTIVE" })).rejects.toThrow("write failed");
    expect(finishWebhookEvent).not.toHaveBeenCalled();
  });
});
