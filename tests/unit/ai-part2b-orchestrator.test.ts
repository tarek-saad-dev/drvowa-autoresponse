import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { processAiReplyJob } from "@/modules/ai/orchestrator";
import { WhatsAppRuntimeError } from "@/modules/channels/runtime-client";
import { aiOutboundIdempotencyKey } from "@/modules/ai/outbound-policy";
import type { AiReplyJob } from "@/types/domain";

const settingsMocks = vi.hoisted(() => ({
  getChannelAiSettingByConnection: vi.fn(),
}));
const jobsMocks = vi.hoisted(() => ({
  completeJob: vi.fn(),
  persistGeneratedReply: vi.fn(),
  deferUnknownOutbound: vi.fn(),
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
vi.mock("@/modules/usage/service", () => ({ recordUsageEvent: vi.fn() }));
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
    jobsMocks.persistGeneratedReply.mockResolvedValue(undefined);
    jobsMocks.deferUnknownOutbound.mockResolvedValue(undefined);
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
    expect(messagingMocks.insertUsageEventInTrx).toHaveBeenCalledTimes(2);
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
    expect(jobsMocks.deferUnknownOutbound).toHaveBeenCalledWith(
      expect.objectContaining({ delaySeconds: 2 }),
    );
  });

  it("11. recovered duplicate completes SENT", async () => {
    const job = baseJob({
      generatedReplyText: "نص محفوظ",
      generatedModel: "mock",
      attemptCount: 2,
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
    const job = baseJob({
      generatedReplyText: "نص محفوظ",
      generatedModel: "mock",
      attemptCount: 3,
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
    expect(conversationStateMocks.pauseConversationAi).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "SAFETY_PAUSED",
        pauseReason: "AMBIGUOUS_OUTBOUND",
        conversationId: job.conversationId,
      }),
    );
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

  it("duplicate usage only once when completeJob returns false", async () => {
    jobsMocks.completeJob.mockResolvedValue(false);
    const job = baseJob({ generatedReplyText: "نص", generatedModel: "m" });
    const sendMock = vi.fn().mockResolvedValue({
      success: true,
      status: "duplicate",
      messageId: "wa-1",
    });
    await processAiReplyJob({
      job,
      sendMessage: sendMock,
      provider: {
        async generateReply() {
          throw new Error("no");
        },
      },
      logger: { info() {}, warn() {} },
    });
    expect(messagingMocks.insertUsageEventInTrx).not.toHaveBeenCalled();
  });
});
