import { describe, expect, it, vi, beforeEach } from "vitest";

import { NotFoundError } from "@/lib/tenancy/errors";
import { PLAN_ERROR_CODES, PlanEntitlementError } from "@/modules/billing/errors";

vi.mock("@/lib/db", () => ({
  withTransaction: async (fn: (trx: unknown) => Promise<unknown>) => fn({}),
  query: vi.fn(),
  sql: {},
}));

vi.mock("@/modules/messaging/repository", () => ({
  getConversationForBusiness: vi.fn(),
  getContactForBusiness: vi.fn(),
  insertMessageIdempotent: vi.fn(),
  touchConversationOutbound: vi.fn(),
}));

vi.mock("@/modules/channels/repository", () => ({
  getChannelConnection: vi.fn(),
}));

vi.mock("@/modules/channels/runtime-client", () => {
  class WhatsAppRuntimeError extends Error {
    status: number;
    code: string;
    constructor(message: string, options: { status: number; code: string }) {
      super(message);
      this.name = "WhatsAppRuntimeError";
      this.status = options.status;
      this.code = options.code;
    }
  }
  return {
    WhatsAppRuntimeError,
    sendAccountMessage: vi.fn(),
  };
});

vi.mock("@/modules/billing/entitlements", () => ({
  reserveQuota: vi.fn(),
  releaseQuotaReservation: vi.fn(),
  markQuotaReservationUncertain: vi.fn(),
  consumeQuotaReservation: vi.fn(),
}));

vi.mock("@/modules/ai/conversation-state-repository", () => ({
  pauseConversationAi: vi.fn(),
}));

import * as messagingRepo from "@/modules/messaging/repository";
import * as channelsRepo from "@/modules/channels/repository";
import * as runtimeClient from "@/modules/channels/runtime-client";
import * as entitlements from "@/modules/billing/entitlements";
import * as aiState from "@/modules/ai/conversation-state-repository";
import { sendManualInboxReply } from "@/modules/inbox/manual-reply-service";

const businessId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const conversationId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const contactId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const channelId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

describe("sendManualInboxReply", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(messagingRepo.getConversationForBusiness).mockResolvedValue({
      conversationId,
      businessId,
      contactId,
      channelConnectionId: channelId,
    } as never);
    vi.mocked(messagingRepo.getContactForBusiness).mockResolvedValue({
      contactId,
      phoneNormalized: "966500000000",
    } as never);
    vi.mocked(channelsRepo.getChannelConnection).mockResolvedValue({
      externalAccountKey: "acct_test",
    } as never);
    vi.mocked(entitlements.reserveQuota).mockResolvedValue({
      state: "RESERVED",
      idempotent: false,
    } as never);
    vi.mocked(runtimeClient.sendAccountMessage).mockResolvedValue({
      success: true,
      status: "sent",
      messageId: "wa-msg-1",
    } as never);
    vi.mocked(messagingRepo.insertMessageIdempotent).mockResolvedValue({
      message: { messageId: "msg-1" },
    } as never);
    vi.mocked(messagingRepo.touchConversationOutbound).mockResolvedValue(undefined as never);
    vi.mocked(entitlements.consumeQuotaReservation).mockResolvedValue(undefined as never);
    vi.mocked(aiState.pauseConversationAi).mockResolvedValue(undefined as never);
  });

  it("sends, persists, consumes quota, and pauses AI", async () => {
    const result = await sendManualInboxReply({
      businessId,
      conversationId,
      text: "مرحبا",
      idempotencyKey: "11111111-1111-4111-8111-111111111111",
    });
    expect(result.status).toBe("SENT");
    if (result.status === "SENT") {
      expect(result.aiPaused).toBe(true);
      expect(result.messageId).toBe("msg-1");
    }
    expect(entitlements.consumeQuotaReservation).toHaveBeenCalled();
    expect(aiState.pauseConversationAi).toHaveBeenCalled();
    expect(runtimeClient.sendAccountMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        accountKey: "acct_test",
        phone: "966500000000",
      }),
    );
  });

  it("returns FAILED on quota entitlement error without send", async () => {
    vi.mocked(entitlements.reserveQuota).mockRejectedValue(
      new PlanEntitlementError(PLAN_ERROR_CODES.WHATSAPP_OUTBOUND_QUOTA_EXCEEDED),
    );
    const result = await sendManualInboxReply({
      businessId,
      conversationId,
      text: "مرحبا",
      idempotencyKey: "11111111-1111-4111-8111-111111111112",
    });
    expect(result.status).toBe("FAILED");
    expect(runtimeClient.sendAccountMessage).not.toHaveBeenCalled();
  });

  it("marks UNCERTAIN on ambiguous runtime error and does not release", async () => {
    const { WhatsAppRuntimeError } = runtimeClient;
    vi.mocked(runtimeClient.sendAccountMessage).mockRejectedValue(
      new WhatsAppRuntimeError("timeout", {
        status: 504,
        code: "RUNTIME_TIMEOUT",
      }),
    );
    const result = await sendManualInboxReply({
      businessId,
      conversationId,
      text: "مرحبا",
      idempotencyKey: "11111111-1111-4111-8111-111111111113",
    });
    expect(result.status).toBe("AMBIGUOUS");
    expect(entitlements.markQuotaReservationUncertain).toHaveBeenCalled();
    expect(entitlements.releaseQuotaReservation).not.toHaveBeenCalled();
  });

  it("throws NotFound when conversation missing", async () => {
    vi.mocked(messagingRepo.getConversationForBusiness).mockResolvedValue(null);
    await expect(
      sendManualInboxReply({
        businessId,
        conversationId,
        text: "مرحبا",
        idempotencyKey: "11111111-1111-4111-8111-111111111114",
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
