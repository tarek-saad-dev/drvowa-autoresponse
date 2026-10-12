import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({
  withTransaction: vi.fn(),
  sql: { UniqueIdentifier: "UUID", Int: "INT" },
}));
const messagingMocks = vi.hoisted(() => ({
  getConversationForBusiness: vi.fn(),
}));
const stateMocks = vi.hoisted(() => ({
  getEffectiveConversationAiState: vi.fn(),
  resumeConversationAi: vi.fn(),
  pauseConversationAi: vi.fn(),
}));
const settingMocks = vi.hoisted(() => ({
  getChannelAiSettingByConnection: vi.fn(),
}));
const guardMocks = vi.hoisted(() => ({
  evaluateConversationLoopGuard: vi.fn(),
}));
const jobsMocks = vi.hoisted(() => ({
  scheduleOrCoalesceJob: vi.fn(),
}));

vi.mock("@/lib/db", () => dbMocks);
vi.mock("@/modules/messaging/repository", () => messagingMocks);
vi.mock("@/modules/ai/conversation-state-repository", () => stateMocks);
vi.mock("@/modules/ai/settings-repository", () => settingMocks);
vi.mock("@/modules/ai/guard-repository", () => guardMocks);
vi.mock("@/modules/ai/jobs-repository", () => jobsMocks);

import { resumeInboxConversationAiWithCatchUp } from "@/modules/ai/inbox-ai-service";

const ids = {
  businessId: "11111111-1111-1111-1111-111111111111",
  conversationId: "22222222-2222-2222-2222-222222222222",
};
const now = () => new Date();
const inbound = (id: string, text = "مواعيد الفرع؟") => ({
  MessageID: id,
  Direction: "INBOUND",
  ContentType: "TEXT",
  TextContent: text,
  ReceivedAtUtc: now(),
});
const outbound = () => ({
  ...inbound("outgoing"),
  Direction: "OUTBOUND",
});

describe("manual AI resume catch-up integration", () => {
  let thread: ReturnType<typeof inbound>[];
  let activeJob: { Status: string }[];
  let queryMock: ReturnType<typeof vi.fn>;
  let executeMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    thread = [inbound("latest"), inbound("previous"), outbound()];
    activeJob = [];
    queryMock = vi.fn(async (statement: string) => {
      if (statement.includes("WITH (UPDLOCK, HOLDLOCK)")) {
        return {
          recordset: [{
            ConversationID: ids.conversationId,
            ChannelConnectionID: "33333333-3333-3333-3333-333333333333",
            ContactID: "44444444-4444-4444-4444-444444444444",
          }],
        };
      }
      if (statement.includes("FROM dbo.TblMessage")) {
        return { recordset: thread };
      }
      if (statement.includes("FROM dbo.TblAiReplyJob")) {
        return { recordset: activeJob };
      }
      throw new Error("Unexpected SQL: " + statement);
    });
    executeMock = vi.fn(async () => 0);
    dbMocks.withTransaction.mockImplementation(async (callback) =>
      callback({ query: queryMock, execute: executeMock }));
    messagingMocks.getConversationForBusiness.mockResolvedValue({
      ...ids,
      channelConnectionId: "33333333-3333-3333-3333-333333333333",
    });
    stateMocks.getEffectiveConversationAiState.mockResolvedValue({
      ...ids,
      mode: "HUMAN_PAUSED",
    });
    stateMocks.resumeConversationAi.mockResolvedValue({
      ...ids,
      mode: "AUTO",
      resumedAtUtc: now(),
    });
    settingMocks.getChannelAiSettingByConnection.mockResolvedValue({
      autoReplyEnabled: true,
      enabledAtUtc: new Date("2026-01-01T00:00:00Z"),
    });
    guardMocks.evaluateConversationLoopGuard.mockResolvedValue({ allow: true });
    jobsMocks.scheduleOrCoalesceJob.mockResolvedValue({ coalesced: false });
  });

  it("queues one immediate job for the latest two unanswered messages", async () => {
    const result = await resumeInboxConversationAiWithCatchUp(ids);
    expect(result.catchUp).toEqual({ scheduled: true, pendingCount: 2 });
    expect(jobsMocks.scheduleOrCoalesceJob).toHaveBeenCalledOnce();
    expect(jobsMocks.scheduleOrCoalesceJob).toHaveBeenCalledWith(
      expect.objectContaining({ triggerMessageId: "latest", debounceMs: 0 }),
      expect.anything(),
    );
    expect(executeMock).toHaveBeenCalledOnce();
  });

  it("never requeues if another click has already resumed the same chat", async () => {
    stateMocks.getEffectiveConversationAiState.mockResolvedValue({
      ...ids,
      mode: "AUTO",
    });
    const result = await resumeInboxConversationAiWithCatchUp(ids);
    expect(result.catchUp.reason).toBe("ALREADY_AUTO");
    expect(stateMocks.resumeConversationAi).not.toHaveBeenCalled();
    expect(jobsMocks.scheduleOrCoalesceJob).not.toHaveBeenCalled();
  });

  it("does not queue when a human has already replied", async () => {
    thread = [outbound(), inbound("answered")];
    const result = await resumeInboxConversationAiWithCatchUp(ids);
    expect(result.catchUp.reason).toBe("NOTHING_PENDING");
    expect(jobsMocks.scheduleOrCoalesceJob).not.toHaveBeenCalled();
  });

  it("does not revive historical customer messages", async () => {
    thread = [{ ...inbound("old"), ReceivedAtUtc: new Date("2026-01-01T00:00:00Z") }];
    const result = await resumeInboxConversationAiWithCatchUp(ids);
    expect(result.catchUp.reason).toBe("STALE_INBOUND");
    expect(jobsMocks.scheduleOrCoalesceJob).not.toHaveBeenCalled();
  });

  it("respects global AI-disabled settings", async () => {
    settingMocks.getChannelAiSettingByConnection.mockResolvedValue({
      autoReplyEnabled: false,
      enabledAtUtc: null,
    });
    const result = await resumeInboxConversationAiWithCatchUp(ids);
    expect(result.catchUp.reason).toBe("AI_DISABLED");
    expect(jobsMocks.scheduleOrCoalesceJob).not.toHaveBeenCalled();
  });

  it("skips ambiguous in-flight or already-sent AI jobs", async () => {
    activeJob = [{ Status: "PROCESSING" }];
    const inFlight = await resumeInboxConversationAiWithCatchUp(ids);
    expect(inFlight.catchUp.reason).toBe("REPLY_IN_FLIGHT");
    activeJob = [{ Status: "SENT" }];
    const sent = await resumeInboxConversationAiWithCatchUp(ids);
    expect(sent.catchUp.reason).toBe("ALREADY_ANSWERED");
    expect(jobsMocks.scheduleOrCoalesceJob).not.toHaveBeenCalled();
  });

  it("does not catch up when explicitly clearing a safety pause", async () => {
    stateMocks.getEffectiveConversationAiState.mockResolvedValue({
      ...ids,
      mode: "SAFETY_PAUSED",
    });
    const result = await resumeInboxConversationAiWithCatchUp(ids);
    expect(result.catchUp.reason).toBe("SAFETY_RESUME");
    expect(jobsMocks.scheduleOrCoalesceJob).not.toHaveBeenCalled();
  });
});
