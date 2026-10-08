/**
 * Truthful per-conversation AI reply status for the inbox.
 * "AUTO" mode alone only means AI is *allowed* to reply; this derives whether
 * the customer's latest message is actually being answered.
 */

import type {
  AiReplyHealth,
  AiReplyHealthReason,
  ConversationAiMode,
} from "@/types/domain";

/** Job past due this long without finishing means the worker isn't processing. */
export const AI_REPLY_STALL_MS = 2 * 60 * 1000;
/** Older unanswered inbound is history, not a live failure. */
export const AI_REPLY_HEALTH_WINDOW_MS = 24 * 60 * 60 * 1000;

export type AiReplyHealthInput = {
  aiMode: ConversationAiMode;
  autoReplyEnabled: boolean;
  enabledAtUtc: Date | null;
  lastInboundAtUtc: Date | null;
  lastInboundContentType: string | null;
  answeredAfterLastInbound: boolean;
  lastInboundJob: {
    status: string;
    lastErrorCode: string | null;
    notBeforeUtc: Date | null;
  } | null;
};

export function aiReplyFailureReason(
  errorCode: string | null,
): AiReplyHealthReason {
  const code = (errorCode ?? "").toUpperCase();
  if (!code) return "UNKNOWN";
  if (code.startsWith("GEMINI_")) return "AI_GENERATION_FAILED";
  if (code.includes("QUOTA_EXCEEDED") || code.startsWith("PLAN_")) {
    return "QUOTA_EXCEEDED";
  }
  if (code === "AGENT_NOT_AVAILABLE") return "AGENT_UNAVAILABLE";
  if (code === "AI_DISABLED" || code === "AI_DISABLED_BEFORE_SEND") {
    return "AI_DISABLED";
  }
  if (code === "DESTINATION_UNAVAILABLE") return "DESTINATION_UNAVAILABLE";
  if (code === "LOOP_GUARD_ACTIVE") return "LOOP_GUARD";
  if (
    code === "NOT_READY"
    || code === "LOGGED_OUT"
    || code === "NOT_STARTED"
    || code === "ACCOUNT_KEY_MISSING"
    || code === "SEND_FAILED"
    || code === "IDEMPOTENCY_CONFLICT"
    || code.startsWith("OUTBOUND_RESULT_UNKNOWN")
  ) {
    return "WHATSAPP_SEND_FAILED";
  }
  return "UNKNOWN";
}

export function deriveAiReplyHealth(
  input: AiReplyHealthInput,
  now: Date = new Date(),
): AiReplyHealth | null {
  if (input.aiMode !== "AUTO") return null;

  if (!input.autoReplyEnabled || !input.enabledAtUtc) {
    return { state: "DISABLED", reason: "AI_DISABLED", errorCode: null };
  }

  const inboundAt = input.lastInboundAtUtc;
  if (!inboundAt || input.answeredAfterLastInbound) return null;
  if (inboundAt.getTime() < input.enabledAtUtc.getTime()) return null;
  if (now.getTime() - inboundAt.getTime() > AI_REPLY_HEALTH_WINDOW_MS) {
    return null;
  }

  const job = input.lastInboundJob;
  if (!job) {
    // Jobs are created in the same transaction as the inbound message,
    // so a missing job is definitive, not "still scheduling".
    return {
      state: "FAILED",
      reason:
        input.lastInboundContentType && input.lastInboundContentType !== "TEXT"
          ? "UNSUPPORTED_CONTENT"
          : "NOT_SCHEDULED",
      errorCode: null,
    };
  }

  if (job.status === "PENDING" || job.status === "PROCESSING") {
    const dueAt = Math.max(
      inboundAt.getTime(),
      job.notBeforeUtc?.getTime() ?? 0,
    );
    if (now.getTime() - dueAt > AI_REPLY_STALL_MS) {
      return {
        state: "FAILED",
        reason: "WORKER_STALLED",
        errorCode: job.lastErrorCode,
      };
    }
    return { state: "REPLYING", reason: null, errorCode: null };
  }

  if (job.status === "FAILED" || job.status === "SKIPPED") {
    return {
      state: "FAILED",
      reason: aiReplyFailureReason(job.lastErrorCode),
      errorCode: job.lastErrorCode,
    };
  }

  return null;
}
