import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildSystemPrompt,
  buildUserPrompt,
  sanitizeReplyText,
  MAX_REPLY_CHARS,
} from "@/modules/ai/provider";
import { maybeScheduleAiReplyAfterInbound } from "@/modules/ai/schedule";
import {
  aiOutboundIdempotencyKey,
  MAX_SEND_RESOLUTION_ATTEMPTS,
  outboundUnknownRetryDelaySeconds,
} from "@/modules/ai/outbound-policy";

const settingsMocks = vi.hoisted(() => ({
  getChannelAiSettingByConnection: vi.fn(),
}));
const jobsMocks = vi.hoisted(() => ({
  scheduleOrCoalesceJob: vi.fn(),
}));
const guardMocks = vi.hoisted(() => ({
  evaluateConversationLoopGuard: vi.fn(),
}));
const conversationStateMocks = vi.hoisted(() => ({
  evaluateConversationAiScheduleGate: vi.fn(),
}));

vi.mock("@/modules/ai/settings-repository", () => settingsMocks);
vi.mock("@/modules/ai/jobs-repository", () => jobsMocks);
vi.mock("@/modules/ai/guard-repository", () => guardMocks);
vi.mock("@/modules/ai/conversation-state-repository", () => conversationStateMocks);

describe("Phase 3B AI provider helpers", () => {
  it("21. reply length bounded", () => {
    const long = "ا".repeat(MAX_REPLY_CHARS + 200);
    expect(sanitizeReplyText(long).length).toBe(MAX_REPLY_CHARS);
  });

  it("20. empty Gemini output rejected by sanitize", () => {
    expect(sanitizeReplyText("   ")).toBe("");
    expect(sanitizeReplyText("```\n```")).toBe("");
  });

  it("18. Gemini provider receives bounded context builders", () => {
    const system = buildSystemPrompt({
      name: "نورا",
      roleTitle: "موظفة استقبال",
      language: "ar",
      dialect: "egyptian",
      tone: "ودود",
      instructions: "رحّب بالعملاء",
    });
    expect(system).toMatch(/Never invent unavailable facts/i);
    expect(system).toMatch(/نورا/);

    const user = buildUserPrompt({
      businessId: "b",
      conversationId: "c",
      agent: {
        name: "نورا",
        roleTitle: "r",
        language: "ar",
        dialect: null,
        tone: null,
        instructions: null,
      },
      knowledge: [{ category: "FAQ", title: "ساعات", content: "من 10 إلى 6" }],
      recentMessages: [
        {
          direction: "INBOUND",
          textContent: "السلام عليكم",
          createdAtUtc: new Date(),
          messageId: "m1",
        },
      ],
    });
    expect(user).toMatch(/ساعات/);
    expect(user).toMatch(/Customer: السلام عليكم/);
  });
});

describe("Phase 3B Part 2B outbound policy", () => {
  it("1/2. stable ai:<jobId> idempotency key", () => {
    const jobId = "31d6e6ce-900b-4cfd-b8f5-e92b08047ee3";
    expect(aiOutboundIdempotencyKey(jobId)).toBe(`ai:${jobId}`);
    expect(aiOutboundIdempotencyKey(jobId.toUpperCase())).toBe(`ai:${jobId}`);
  });

  it("12. bounded unknown retry delays", () => {
    expect(MAX_SEND_RESOLUTION_ATTEMPTS).toBe(3);
    expect(outboundUnknownRetryDelaySeconds(1)).toBe(2);
    expect(outboundUnknownRetryDelaySeconds(2)).toBe(5);
    expect(outboundUnknownRetryDelaySeconds(3)).toBeNull();
  });
});

describe("Phase 3B schedule gates", () => {
  beforeEach(() => {
    settingsMocks.getChannelAiSettingByConnection.mockReset();
    jobsMocks.scheduleOrCoalesceJob.mockReset();
    guardMocks.evaluateConversationLoopGuard.mockReset();
    conversationStateMocks.evaluateConversationAiScheduleGate.mockReset();
    guardMocks.evaluateConversationLoopGuard.mockResolvedValue({
      allow: true,
      recentSentCount: 0,
    });
    conversationStateMocks.evaluateConversationAiScheduleGate.mockResolvedValue({
      allow: true,
      state: { mode: "AUTO" },
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("1/29. AI defaults disabled means no job", async () => {
    settingsMocks.getChannelAiSettingByConnection.mockResolvedValue(null);
    const result = await maybeScheduleAiReplyAfterInbound({
      businessId: "11111111-1111-1111-1111-111111111111",
      channelConnectionId: "22222222-2222-2222-2222-222222222222",
      conversationId: "33333333-3333-3333-3333-333333333333",
      contactId: "44444444-4444-4444-4444-444444444444",
      triggerMessageId: "55555555-5555-5555-5555-555555555555",
      contentType: "TEXT",
      messageReceivedAt: new Date(),
    });
    expect(result.scheduled).toBe(false);
    expect(jobsMocks.scheduleOrCoalesceJob).not.toHaveBeenCalled();
  });

  it("7. UNKNOWN content no AI job", async () => {
    settingsMocks.getChannelAiSettingByConnection.mockResolvedValue({
      autoReplyEnabled: true,
      enabledAtUtc: new Date("2020-01-01T00:00:00.000Z"),
      debounceMs: 900,
    });
    const result = await maybeScheduleAiReplyAfterInbound({
      businessId: "11111111-1111-1111-1111-111111111111",
      channelConnectionId: "22222222-2222-2222-2222-222222222222",
      conversationId: "33333333-3333-3333-3333-333333333333",
      contactId: "44444444-4444-4444-4444-444444444444",
      triggerMessageId: "55555555-5555-5555-5555-555555555555",
      contentType: "UNKNOWN",
      messageReceivedAt: new Date(),
    });
    expect(result.scheduled).toBe(false);
    expect(jobsMocks.scheduleOrCoalesceJob).not.toHaveBeenCalled();
  });

  it("4. message before EnabledAtUtc ignored", async () => {
    settingsMocks.getChannelAiSettingByConnection.mockResolvedValue({
      autoReplyEnabled: true,
      enabledAtUtc: new Date("2026-06-01T12:00:00.000Z"),
      debounceMs: 900,
    });
    const result = await maybeScheduleAiReplyAfterInbound({
      businessId: "11111111-1111-1111-1111-111111111111",
      channelConnectionId: "22222222-2222-2222-2222-222222222222",
      conversationId: "33333333-3333-3333-3333-333333333333",
      contactId: "44444444-4444-4444-4444-444444444444",
      triggerMessageId: "55555555-5555-5555-5555-555555555555",
      contentType: "TEXT",
      messageReceivedAt: new Date("2026-05-01T12:00:00.000Z"),
    });
    expect(result.scheduled).toBe(false);
  });

  it("5. new text after EnabledAtUtc creates/coalesces job", async () => {
    settingsMocks.getChannelAiSettingByConnection.mockResolvedValue({
      autoReplyEnabled: true,
      enabledAtUtc: new Date("2026-01-01T00:00:00.000Z"),
      debounceMs: 900,
    });
    jobsMocks.scheduleOrCoalesceJob.mockResolvedValue({
      job: { aiReplyJobId: "j1" },
      coalesced: false,
    });
    const result = await maybeScheduleAiReplyAfterInbound({
      businessId: "11111111-1111-1111-1111-111111111111",
      channelConnectionId: "22222222-2222-2222-2222-222222222222",
      conversationId: "33333333-3333-3333-3333-333333333333",
      contactId: "44444444-4444-4444-4444-444444444444",
      triggerMessageId: "55555555-5555-5555-5555-555555555555",
      contentType: "TEXT",
      messageReceivedAt: new Date("2026-09-01T00:00:00.000Z"),
    });
    expect(result.scheduled).toBe(true);
    expect(jobsMocks.scheduleOrCoalesceJob).toHaveBeenCalledTimes(1);
  });

  it("loop guard active blocks schedule", async () => {
    settingsMocks.getChannelAiSettingByConnection.mockResolvedValue({
      autoReplyEnabled: true,
      enabledAtUtc: new Date("2026-01-01T00:00:00.000Z"),
      debounceMs: 900,
    });
    guardMocks.evaluateConversationLoopGuard.mockResolvedValue({
      allow: false,
      reason: "LOOP_GUARD_ACTIVE",
      recentSentCount: 3,
    });
    const result = await maybeScheduleAiReplyAfterInbound({
      businessId: "11111111-1111-1111-1111-111111111111",
      channelConnectionId: "22222222-2222-2222-2222-222222222222",
      conversationId: "33333333-3333-3333-3333-333333333333",
      contactId: "44444444-4444-4444-4444-444444444444",
      triggerMessageId: "55555555-5555-5555-5555-555555555555",
      contentType: "TEXT",
      messageReceivedAt: new Date("2026-09-01T00:00:00.000Z"),
    });
    expect(result.scheduled).toBe(false);
    expect(result.reason).toBe("LOOP_GUARD_ACTIVE");
    expect(jobsMocks.scheduleOrCoalesceJob).not.toHaveBeenCalled();
  });

  it("30/35. HUMAN_PAUSED and SAFETY_PAUSED block scheduling", async () => {
    settingsMocks.getChannelAiSettingByConnection.mockResolvedValue({
      autoReplyEnabled: true,
      enabledAtUtc: new Date("2026-01-01T00:00:00.000Z"),
      debounceMs: 900,
    });
    conversationStateMocks.evaluateConversationAiScheduleGate.mockResolvedValue({
      allow: false,
      reason: "HUMAN_PAUSED",
      state: { mode: "HUMAN_PAUSED" },
    });
    const paused = await maybeScheduleAiReplyAfterInbound({
      businessId: "11111111-1111-1111-1111-111111111111",
      channelConnectionId: "22222222-2222-2222-2222-222222222222",
      conversationId: "33333333-3333-3333-3333-333333333333",
      contactId: "44444444-4444-4444-4444-444444444444",
      triggerMessageId: "55555555-5555-5555-5555-555555555555",
      contentType: "TEXT",
      messageReceivedAt: new Date("2026-09-01T00:00:00.000Z"),
    });
    expect(paused.scheduled).toBe(false);
    expect(paused.reason).toBe("HUMAN_PAUSED");
    expect(jobsMocks.scheduleOrCoalesceJob).not.toHaveBeenCalled();

    conversationStateMocks.evaluateConversationAiScheduleGate.mockResolvedValue({
      allow: false,
      reason: "SAFETY_PAUSED",
      state: { mode: "SAFETY_PAUSED" },
    });
    const safety = await maybeScheduleAiReplyAfterInbound({
      businessId: "11111111-1111-1111-1111-111111111111",
      channelConnectionId: "22222222-2222-2222-2222-222222222222",
      conversationId: "33333333-3333-3333-3333-333333333333",
      contactId: "44444444-4444-4444-4444-444444444444",
      triggerMessageId: "66666666-6666-6666-6666-666666666666",
      contentType: "TEXT",
      messageReceivedAt: new Date("2026-09-01T00:00:00.000Z"),
    });
    expect(safety.scheduled).toBe(false);
    expect(safety.reason).toBe("SAFETY_PAUSED");
  });
});
