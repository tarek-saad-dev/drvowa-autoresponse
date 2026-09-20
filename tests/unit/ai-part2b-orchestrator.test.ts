import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { processAiReplyJob } from "@/modules/ai/orchestrator";
import { WhatsAppRuntimeError } from "@/modules/channels/runtime-client";
import { aiOutboundIdempotencyKey } from "@/modules/ai/outbound-policy";
import {
  PLAN_ERROR_CODES,
  PlanEntitlementError,
} from "@/modules/billing/errors";
import type { AiReplyJob } from "@/types/domain";

const settingsMocks = vi.hoisted(() => ({
  getChannelAiSettingByConnection: vi.fn(),
}));
const jobsMocks = vi.hoisted(() => ({
  completeJob: vi.fn(),
  persistGeneratedReply: vi.fn(),
  deferUnknownOutbound: vi.fn(),
  recordAmbiguousOutbound: vi.fn(),
  assertJobLeaseOwned: vi.fn(),
  getJob: vi.fn(),
}));
const conversationStateMocks = vi.hoisted(() => ({
  evaluateConversationAiSendGate: vi.fn(),
  pauseConversationAi: vi.fn(),
}));
const guardMocks = vi.hoisted(() => ({
  evaluateConversationLoopGuard: vi.fn(),
  logAiSafety: vi.fn(),
}));
const agentMocks = vi.hoisted(() => ({
  getAgent: vi.fn(),
}));
const channelMocks = vi.hoisted(() => ({
  getChannelConnection: vi.fn(),
}));
const knowledgeMocks = vi.hoisted(() => ({
  listItems: vi.fn(),
}));
const messagingMocks = vi.hoisted(() => ({
  getContactForBusiness: vi.fn(),
  listRecentTextMessages: vi.fn(),
  insertMessageIdempotent: vi.fn(),
  touchConversationOutbound: vi.fn(),
  insertUsageEventInTrx: vi.fn(),
}));
const billingMocks = vi.hoisted(() => ({
  reserveQuota: vi.fn(),
  consumeQuotaReservation: vi.fn(),
  releaseQuotaReservation: vi.fn(),
  markQuotaReservationUncertain: vi.fn(),
}));
const dbMocks = vi.hoisted(() => ({
  withTransaction: vi.fn(async (fn: (trx: unknown) => Promise<unknown>) => fn({})),
}));

vi.mock("@/modules/ai/settings-repository", () => settingsMocks);
vi.mock("@/modules/ai/jobs-repository", () => jobsMocks);
vi.mock("@/modules/ai/conversation-state-repository", () => conversationStateMocks);
vi.mock("@/modules/ai/guard-repository", () => guardMocks);
vi.mock("@/modules/agents/service", () => agentMocks);
vi.mock("@/modules/channels/repository", () => channelMocks);
vi.mock("@/modules/knowledge/service", () => knowledgeMocks);
vi.mock("@/modules/messaging/repository", () => messagingMocks);
vi.mock("@/modules/billing/entitlements", () => billingMocks);
vi.mock("@/lib/db", () => dbMocks);

function baseJob(overrides: Partial<AiReplyJob> = {}): AiReplyJob {
  const id = "31d6e6ce-900b-4cfd-b8f5-e92b08047ee3";
  return {
    aiReplyJobId: id,
    businessId: "11111111-1111-1111-1111-111111111111",
    channelConnectionId: "22222222-2222-2222-2222-222222222222",
    conversationId: "33333333-3333-3333-3333-333333333333",
    contactId: "44444444-4444-4444-4444-444444444444",
    triggerMessageId: "55555555-5555-5555-5555-555555555555",
    status: "PROCESSING",
    notBeforeUtc: new Date(Date.now() - 1000),
    attemptCount: 1,
    leaseUntilUtc: new Date(Date.now() + 60_000),
    leaseToken: "66666666-6666-6666-6666-666666666666",
    leaseOwner: "w-test-1",
    leaseVersion: 1,
    outboundUnknownCount: 0,
    startedAtUtc: new Date(),
    completedAtUtc: null,
    lastErrorCode: null,
    generatedReplyText: null,
    generatedModel: null,
    generatedAtUtc: null,
    outboundProviderMessageId: null,
    createdAtUtc: new Date("2026-09-01T00:00:00.000Z"),
    updatedAtUtc: new Date(),
    ...overrides,
  };
}

describe("Phase 3B Part 2B orchestrator outbound", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    settingsMocks.getChannelAiSettingByConnection.mockResolvedValue({
      autoReplyEnabled: true,
      enabledAtUtc: new Date("2026-01-01T00:00:00.000Z"),
      agentId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      debounceMs: 50,
    });
    agentMocks.getAgent.mockResolvedValue({
      agentId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      name: "Agent",
      roleTitle: "Reception",
      language: "ar",
      dialect: null,
      tone: null,
      instructions: null,
      isActive: true,
    });
    messagingMocks.getContactForBusiness.mockResolvedValue({
      contactId: "44444444-4444-4444-4444-444444444444",
      phoneNormalized: "201555900001",
    });
    channelMocks.getChannelConnection.mockResolvedValue({
      externalAccountKey: "acct-1",
    });
    knowledgeMocks.listItems.mockResolvedValue([]);
    messagingMocks.listRecentTextMessages.mockResolvedValue([
      {
        messageId: "m1",
        direction: "INBOUND",
        textContent: "hello",
        createdAtUtc: new Date(),
      },
    ]);
    conversationStateMocks.evaluateConversationAiSendGate.mockResolvedValue({
      allow: true,
      state: { mode: "AUTO" },
    });
    guardMocks.evaluateConversationLoopGuard.mockResolvedValue({
      allow: true,
      recentSentCount: 0,
    });
    jobsMocks.completeJob.mockResolvedValue(true);
    jobsMocks.persistGeneratedReply.mockResolvedValue(true);
    jobsMocks.deferUnknownOutbound.mockResolvedValue(true);
    jobsMocks.assertJobLeaseOwned.mockResolvedValue(undefined);
    jobsMocks.recordAmbiguousOutbound.mockResolvedValue({
      outcome: "deferred",
      outboundUnknownCount: 1,
      delaySeconds: 2,
    });
    jobsMocks.getJob.mockResolvedValue(baseJob({
      generatedReplyText: "حاضر",
      generatedModel: "mock",
    }));
    messagingMocks.insertMessageIdempotent.mockResolvedValue({
      message: { messageId: "out-1" },
      inserted: true,
    });
    messagingMocks.touchConversationOutbound.mockResolvedValue(undefined);
    messagingMocks.insertUsageEventInTrx.mockResolvedValue(undefined);
    billingMocks.reserveQuota.mockResolvedValue({
      reservationId: "r1",
      state: "RESERVED",
      idempotent: false,
      periodStartUtc: new Date(),
    });
    billingMocks.consumeQuotaReservation.mockResolvedValue(undefined);
    billingMocks.releaseQuotaReservation.mockResolvedValue(undefined);
    billingMocks.markQuotaReservationUncertain.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("1/2/3. send includes stable idempotencyKey and completes SENT", async () => {
    const job = baseJob();
    const sendMock = vi.fn().mockResolvedValue({
      success: true,
      status: "sent",
      messageId: "wa-1",
    });
    const result = await processAiReplyJob({
      job,
      sendMessage: sendMock,
      provider: {
        async generateReply() {
          return { text: "حاضر", model: "mock", latencyMs: 1 };
        },
      },
      logger: { info() {}, warn() {} },
    });
    expect(result.status).toBe("SENT");
    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: aiOutboundIdempotencyKey(job.aiReplyJobId),
        message: "حاضر",
      }),
    );
    expect(jobsMocks.persistGeneratedReply).toHaveBeenCalled();
    expect(jobsMocks.completeJob).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "SENT",
        outboundProviderMessageId: "wa-1",
      }),
    );
  });

  it("4/5/6/7. duplicate status uses original messageId once", async () => {
    const job = baseJob({
      generatedReplyText: "حاضر",
      generatedModel: "mock",
      generatedAtUtc: new Date(),
    });
    const sendMock = vi.fn().mockResolvedValue({
      success: true,
      status: "duplicate",
      messageId: "wa-original",
      originalMessageId: "wa-original",
    });
    const result = await processAiReplyJob({
      job,
      sendMessage: sendMock,
      provider: {
        async generateReply() {
          throw new Error("must not regenerate");
        },
      },
      logger: { info() {}, warn() {} },
    });
    expect(result.status).toBe("SENT");
    expect(jobsMocks.persistGeneratedReply).not.toHaveBeenCalled();
    expect(messagingMocks.insertMessageIdempotent).toHaveBeenCalledWith(
      expect.objectContaining({ providerMessageId: "wa-original" }),
      expect.anything(),
    );
    expect(billingMocks.consumeQuotaReservation).toHaveBeenCalledTimes(2);
  });

  it("8/9/10. unknown does not regenerate; reuses text + key", async () => {
    const job = baseJob({
      generatedReplyText: "نص محفوظ",
      generatedModel: "mock",
      generatedAtUtc: new Date(),
      attemptCount: 1,
    });
    const sendMock = vi.fn().mockRejectedValue(
      new WhatsAppRuntimeError("unknown", {
        status: 202,
        code: "OUTBOUND_RESULT_UNKNOWN",
      }),
    );
    const result = await processAiReplyJob({
      job,
      sendMessage: sendMock,
      provider: {
        async generateReply() {
          throw new Error("must not regenerate");
        },
      },
      logger: { info() {}, warn() {} },
    });
    expect(result.status).toBe("DEFERRED");
    expect(result.errorCode).toBe("OUTBOUND_RESULT_UNKNOWN");
    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "نص محفوظ",
        idempotencyKey: aiOutboundIdempotencyKey(job.aiReplyJobId),
      }),
    );
    expect(jobsMocks.recordAmbiguousOutbound).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: job.aiReplyJobId,
        leaseToken: job.leaseToken,
      }),
    );
  });

  it("11. recovered duplicate completes SENT", async () => {
    const job = baseJob({
      generatedReplyText: "نص محفوظ",
      generatedModel: "mock",
      attemptCount: 2,
      outboundUnknownCount: 1,
      lastErrorCode: "OUTBOUND_RESULT_UNKNOWN",
    });
    const sendMock = vi.fn().mockResolvedValue({
      success: true,
      status: "duplicate",
      messageId: "wa-recovered",
    });
    const result = await processAiReplyJob({
      job,
      sendMessage: sendMock,
      provider: {
        async generateReply() {
          throw new Error("must not regenerate");
        },
      },
      logger: { info() {}, warn() {} },
    });
    expect(result.status).toBe("SENT");
  });

  it("12/13/14. persistent unknown becomes FINAL and safety-pauses", async () => {
    jobsMocks.recordAmbiguousOutbound.mockResolvedValue({
      outcome: "finalized",
      outboundUnknownCount: 3,
    });
    const job = baseJob({
      generatedReplyText: "نص محفوظ",
      generatedModel: "mock",
      attemptCount: 5,
      outboundUnknownCount: 2,
    });
    const sendMock = vi.fn().mockRejectedValue(
      new WhatsAppRuntimeError("unknown", {
        status: 202,
        code: "OUTBOUND_RESULT_UNKNOWN",
      }),
    );
    const result = await processAiReplyJob({
      job,
      sendMessage: sendMock,
      provider: {
        async generateReply() {
          throw new Error("must not regenerate");
        },
      },
      logger: { info() {}, warn() {} },
    });
    expect(result.status).toBe("FAILED");
    expect(result.errorCode).toBe("OUTBOUND_RESULT_UNKNOWN_FINAL");
    expect(jobsMocks.recordAmbiguousOutbound).toHaveBeenCalled();
  });

  it("15. IDEMPOTENCY_CONFLICT fails closed", async () => {
    const job = baseJob({ generatedReplyText: "نص", generatedModel: "m" });
    const sendMock = vi.fn().mockRejectedValue(
      new WhatsAppRuntimeError("conflict", {
        status: 409,
        code: "IDEMPOTENCY_CONFLICT",
      }),
    );
    const result = await processAiReplyJob({
      job,
      sendMessage: sendMock,
      provider: {
        async generateReply() {
          throw new Error("no");
        },
      },
      logger: { info() {}, warn() {} },
    });
    expect(result.status).toBe("FAILED");
    expect(result.errorCode).toBe("IDEMPOTENCY_CONFLICT");
    expect(jobsMocks.deferUnknownOutbound).not.toHaveBeenCalled();
  });

  it("28/29. human takeover before send skips without WhatsApp call", async () => {
    const job = baseJob({ generatedReplyText: "نص", generatedModel: "m" });
    conversationStateMocks.evaluateConversationAiSendGate.mockResolvedValue({
      allow: false,
      reason: "HUMAN_TAKEOVER_BEFORE_SEND",
      state: { mode: "HUMAN_PAUSED" },
    });
    const sendMock = vi.fn();
    const result = await processAiReplyJob({
      job,
      sendMessage: sendMock,
      provider: {
        async generateReply() {
          throw new Error("no");
        },
      },
      logger: { info() {}, warn() {} },
    });
    expect(result.status).toBe("SKIPPED");
    expect(result.errorCode).toBe("HUMAN_TAKEOVER_BEFORE_SEND");
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("33. stale conversation activation skips old job after resume", async () => {
    const job = baseJob({
      generatedReplyText: "نص",
      generatedModel: "m",
      createdAtUtc: new Date("2026-08-01T00:00:00.000Z"),
    });
    conversationStateMocks.evaluateConversationAiSendGate.mockResolvedValue({
      allow: false,
      reason: "STALE_CONVERSATION_ACTIVATION",
      state: { mode: "AUTO", resumedAtUtc: new Date("2026-09-10T00:00:00.000Z") },
    });
    const sendMock = vi.fn();
    const result = await processAiReplyJob({
      job,
      sendMessage: sendMock,
      provider: {
        async generateReply() {
          throw new Error("no");
        },
      },
      logger: { info() {}, warn() {} },
    });
    expect(result.status).toBe("SKIPPED");
    expect(result.errorCode).toBe("STALE_CONVERSATION_ACTIVATION");
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("fenced SENT finalization rolls back on lease loss; terminal complete maps LEASE_LOST", async () => {
    const { AiJobLeaseLostError } = await import("@/modules/ai/lease");

    // In-TX assert fails after send ACK → no outbound DB side effects.
    jobsMocks.assertJobLeaseOwned
      .mockResolvedValueOnce(undefined) // before_send
      .mockResolvedValueOnce(undefined) // before_finalize
      .mockRejectedValueOnce(new AiJobLeaseLostError()); // in-TX
    const job = baseJob({ generatedReplyText: "نص", generatedModel: "m" });
    const sendMock = vi.fn().mockResolvedValue({
      success: true,
      status: "sent",
      messageId: "wa-stale",
    });
    const stale = await processAiReplyJob({
      job,
      sendMessage: sendMock,
      provider: {
        async generateReply() {
          throw new Error("no");
        },
      },
      logger: { info() {}, warn() {} },
    });
    expect(stale.status).toBe("LEASE_LOST");
    expect(messagingMocks.insertMessageIdempotent).not.toHaveBeenCalled();
    expect(messagingMocks.touchConversationOutbound).not.toHaveBeenCalled();
    expect(billingMocks.consumeQuotaReservation).not.toHaveBeenCalled();
    expect(jobsMocks.completeJob).not.toHaveBeenCalled();

    // completeJob throws after side-effect calls → LEASE_LOST (TX would roll back).
    vi.clearAllMocks();
    jobsMocks.assertJobLeaseOwned.mockResolvedValue(undefined);
    jobsMocks.getJob.mockResolvedValue(baseJob({
      generatedReplyText: "نص",
      generatedModel: "m",
    }));
    messagingMocks.insertMessageIdempotent.mockResolvedValue({
      message: { messageId: "out-1" },
      inserted: true,
    });
    messagingMocks.touchConversationOutbound.mockResolvedValue(undefined);
    jobsMocks.completeJob.mockRejectedValue(new AiJobLeaseLostError());
    const lostOnComplete = await processAiReplyJob({
      job: baseJob({ generatedReplyText: "نص", generatedModel: "m" }),
      sendMessage: vi.fn().mockResolvedValue({
        success: true,
        status: "sent",
        messageId: "wa-2",
      }),
      provider: {
        async generateReply() {
          throw new Error("no");
        },
      },
      logger: { info() {}, warn() {} },
    });
    expect(lostOnComplete.status).toBe("LEASE_LOST");
    expect(billingMocks.consumeQuotaReservation).not.toHaveBeenCalled();

    // Terminal SKIPPED path must not pretend SKIPPED when lease is lost.
    vi.clearAllMocks();
    settingsMocks.getChannelAiSettingByConnection.mockResolvedValue({
      autoReplyEnabled: false,
      enabledAtUtc: null,
      agentId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      debounceMs: 50,
    });
    jobsMocks.completeJob.mockRejectedValue(new AiJobLeaseLostError());
    const lostSkip = await processAiReplyJob({
      job: baseJob({ generatedReplyText: "نص", generatedModel: "m" }),
      sendMessage: vi.fn(),
      provider: {
        async generateReply() {
          throw new Error("no");
        },
      },
      logger: { info() {}, warn() {} },
    });
    expect(lostSkip.status).toBe("LEASE_LOST");
    expect(lostSkip.errorCode).toBe("LEASE_LOST");
  });

  it("exhausted AI quota skips before Gemini", async () => {
    billingMocks.reserveQuota.mockRejectedValueOnce(
      new PlanEntitlementError(PLAN_ERROR_CODES.AI_QUOTA_EXCEEDED),
    );
    const generateReply = vi.fn(async () => {
      throw new Error("must not call Gemini");
    });
    const sendMock = vi.fn();
    const result = await processAiReplyJob({
      job: baseJob(),
      sendMessage: sendMock,
      provider: { generateReply },
      logger: { info() {}, warn() {} },
    });
    expect(result.status).toBe("SKIPPED");
    expect(result.errorCode).toBe(PLAN_ERROR_CODES.AI_QUOTA_EXCEEDED);
    expect(generateReply).not.toHaveBeenCalled();
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("exhausted WA quota skips before external send and releases AI", async () => {
    billingMocks.reserveQuota
      .mockResolvedValueOnce({
        reservationId: "ai-r",
        state: "RESERVED",
        idempotent: false,
        periodStartUtc: new Date(),
      })
      .mockRejectedValueOnce(
        new PlanEntitlementError(
          PLAN_ERROR_CODES.WHATSAPP_OUTBOUND_QUOTA_EXCEEDED,
        ),
      );
    const sendMock = vi.fn();
    const result = await processAiReplyJob({
      job: baseJob({
        generatedReplyText: "محفوظ",
        generatedModel: "mock",
        generatedAtUtc: new Date(),
      }),
      sendMessage: sendMock,
      provider: {
        async generateReply() {
          throw new Error("must not regenerate");
        },
      },
      logger: { info() {}, warn() {} },
    });
    expect(result.status).toBe("SKIPPED");
    expect(result.errorCode).toBe(
      PLAN_ERROR_CODES.WHATSAPP_OUTBOUND_QUOTA_EXCEEDED,
    );
    expect(sendMock).not.toHaveBeenCalled();
    expect(billingMocks.releaseQuotaReservation).toHaveBeenCalled();
  });

  it("ambiguous then LOGGED_OUT does not release prior UNCERTAIN", async () => {
    const job = baseJob({
      generatedReplyText: "محفوظ",
      generatedModel: "mock",
      generatedAtUtc: new Date(),
    });
    const reserved = {
      reservationId: "r1",
      state: "RESERVED" as const,
      idempotent: false,
      periodStartUtc: new Date(),
    };
    const uncertain = {
      reservationId: "r1",
      state: "UNCERTAIN" as const,
      idempotent: true,
      periodStartUtc: new Date(),
    };

    billingMocks.reserveQuota
      .mockResolvedValueOnce(reserved)
      .mockResolvedValueOnce(reserved);
    const attemptA = await processAiReplyJob({
      job,
      sendMessage: vi.fn().mockRejectedValue(
        new WhatsAppRuntimeError("unknown", {
          status: 202,
          code: "OUTBOUND_RESULT_UNKNOWN",
        }),
      ),
      provider: {
        async generateReply() {
          throw new Error("must not regenerate");
        },
      },
      logger: { info() {}, warn() {} },
    });
    expect(attemptA.status).toBe("DEFERRED");
    expect(billingMocks.markQuotaReservationUncertain).toHaveBeenCalled();
    expect(billingMocks.releaseQuotaReservation).not.toHaveBeenCalled();

    billingMocks.releaseQuotaReservation.mockClear();
    billingMocks.markQuotaReservationUncertain.mockClear();
    billingMocks.reserveQuota
      .mockResolvedValueOnce(uncertain)
      .mockResolvedValueOnce(uncertain);

    const attemptB = await processAiReplyJob({
      job: { ...job, attemptCount: 2 },
      sendMessage: vi.fn().mockRejectedValue(
        new WhatsAppRuntimeError("logged out", {
          status: 401,
          code: "LOGGED_OUT",
        }),
      ),
      provider: {
        async generateReply() {
          throw new Error("must not regenerate");
        },
      },
      logger: { info() {}, warn() {} },
    });
    expect(attemptB.status).toBe("FAILED");
    expect(attemptB.errorCode).toBe("LOGGED_OUT");
    // Must not auto-release an UNCERTAIN commitment from Attempt A
    expect(billingMocks.releaseQuotaReservation).not.toHaveBeenCalled();
  });

  it("pre-send skip after prior UNCERTAIN does not release commitment", async () => {
    const job = baseJob({
      generatedReplyText: "محفوظ",
      generatedModel: "mock",
      generatedAtUtc: new Date(),
    });
    billingMocks.reserveQuota.mockResolvedValue({
      reservationId: "r-unc",
      state: "UNCERTAIN",
      idempotent: true,
      periodStartUtc: new Date(),
    });
    settingsMocks.getChannelAiSettingByConnection
      .mockResolvedValueOnce({
        autoReplyEnabled: true,
        enabledAtUtc: new Date("2020-01-01T00:00:00.000Z"),
        agentId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        debounceMs: 50,
      })
      .mockResolvedValueOnce({
        autoReplyEnabled: false,
        enabledAtUtc: new Date("2020-01-01T00:00:00.000Z"),
        agentId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        debounceMs: 50,
      });

    const sendMock = vi.fn();
    const result = await processAiReplyJob({
      job,
      sendMessage: sendMock,
      provider: {
        async generateReply() {
          throw new Error("must not regenerate");
        },
      },
      logger: { info() {}, warn() {} },
    });
    expect(result.status).toBe("SKIPPED");
    expect(result.errorCode).toBe("AI_DISABLED_BEFORE_SEND");
    expect(sendMock).not.toHaveBeenCalled();
    expect(billingMocks.releaseQuotaReservation).not.toHaveBeenCalled();
  });
});
