import { describe, expect, it } from "vitest";

import {
  AI_REPLY_STALL_MS,
  deriveAiReplyHealth,
  type AiReplyHealthInput,
} from "@/modules/ai/reply-health";

const now = new Date("2026-10-09T00:00:00.000Z");
const ago = (ms: number) => new Date(now.getTime() - ms);

function input(overrides: Partial<AiReplyHealthInput> = {}): AiReplyHealthInput {
  return {
    aiMode: "AUTO",
    autoReplyEnabled: true,
    enabledAtUtc: ago(30 * 24 * 60 * 60 * 1000),
    lastInboundAtUtc: ago(10_000),
    lastInboundContentType: "TEXT",
    answeredAfterLastInbound: false,
    lastInboundJob: null,
    ...overrides,
  };
}

describe("deriveAiReplyHealth", () => {
  it("is silent when the human owns the conversation", () => {
    expect(deriveAiReplyHealth(input({ aiMode: "HUMAN_PAUSED" }), now)).toBeNull();
  });

  it("reports DISABLED when channel auto-reply is off even though mode is AUTO", () => {
    expect(
      deriveAiReplyHealth(input({ autoReplyEnabled: false }), now)?.state,
    ).toBe("DISABLED");
  });

  it("is healthy once the last inbound was answered", () => {
    expect(
      deriveAiReplyHealth(input({ answeredAfterLastInbound: true }), now),
    ).toBeNull();
  });

  it("flags an inbound that never got a job (e.g. dropped by a gate)", () => {
    const health = deriveAiReplyHealth(input(), now);
    expect(health).toMatchObject({ state: "FAILED", reason: "NOT_SCHEDULED" });
  });

  it("flags non-text inbound as unsupported", () => {
    const health = deriveAiReplyHealth(
      input({ lastInboundContentType: "IMAGE" }),
      now,
    );
    expect(health?.reason).toBe("UNSUPPORTED_CONTENT");
  });

  it("shows REPLYING while a fresh job is pending", () => {
    const health = deriveAiReplyHealth(
      input({
        lastInboundJob: { status: "PENDING", lastErrorCode: null, notBeforeUtc: ago(1_000) },
      }),
      now,
    );
    expect(health?.state).toBe("REPLYING");
  });

  it("flags WORKER_STALLED when a due job is not processed", () => {
    const health = deriveAiReplyHealth(
      input({
        lastInboundAtUtc: ago(AI_REPLY_STALL_MS + 60_000),
        lastInboundJob: {
          status: "PENDING",
          lastErrorCode: null,
          notBeforeUtc: ago(AI_REPLY_STALL_MS + 59_000),
        },
      }),
      now,
    );
    expect(health).toMatchObject({ state: "FAILED", reason: "WORKER_STALLED" });
  });

  it.each([
    ["GEMINI_TIMEOUT", "AI_GENERATION_FAILED"],
    ["NOT_READY", "WHATSAPP_SEND_FAILED"],
    ["OUTBOUND_RESULT_UNKNOWN_FINAL", "WHATSAPP_SEND_FAILED"],
    ["PLAN_AI_QUOTA_EXCEEDED", "QUOTA_EXCEEDED"],
    ["AGENT_NOT_AVAILABLE", "AGENT_UNAVAILABLE"],
  ])("maps terminal job error %s to %s", (code, reason) => {
    const health = deriveAiReplyHealth(
      input({
        lastInboundJob: { status: "FAILED", lastErrorCode: code, notBeforeUtc: ago(5_000) },
      }),
      now,
    );
    expect(health).toMatchObject({ state: "FAILED", reason, errorCode: code });
  });

  it("ignores inbound from before AI activation and old history", () => {
    expect(
      deriveAiReplyHealth(input({ enabledAtUtc: ago(1_000) }), now),
    ).toBeNull();
    expect(
      deriveAiReplyHealth(input({ lastInboundAtUtc: ago(25 * 60 * 60 * 1000) }), now),
    ).toBeNull();
  });
});
