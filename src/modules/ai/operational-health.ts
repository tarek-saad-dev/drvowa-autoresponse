/**
 * Aggregates live operational signals for the receptionist status card.
 * Never treats sticky DB ChannelConnection.Status=ACTIVE as proof of a live socket.
 */

import { getWhatsAppConnectionView } from "@/modules/channels/whatsapp-service";
import type { WhatsAppConnectionView } from "@/modules/channels/whatsapp-service";
import { getAiWorkerQueueStatus } from "./worker-status";
import {
  AI_WORKER_LIVENESS_STALE_MS,
  getAiWorkerLiveness,
  type AiWorkerLiveness,
} from "./worker-liveness";

export type OperationalAttentionCode =
  | "whatsapp_disconnected"
  | "inbound_degraded"
  | "worker_unavailable"
  | "job_backlog"
  | "outbound_failures"
  | "ai_paused"
  | "setup_incomplete"
  | "runtime_error"
  | "runtime_unknown";

export type ReceptionistOperationalHealth = {
  overall: "healthy" | "attention" | "checking";
  attentionCode: OperationalAttentionCode | null;
  whatsappLiveState: string | null;
  inboundHealth: "healthy" | "degraded" | "unknown" | null;
  worker: AiWorkerLiveness;
  autoReplyEnabled: boolean;
  hasActiveAgent: boolean;
  hasActiveKnowledge: boolean;
  /** Freshness of the WhatsApp runtime probe for this business. */
  runtimeProbedAtUtc: Date | null;
  runtimeProbeCached: boolean;
};

export type OperationalHealthInput = {
  businessId: string;
  businessName: string;
  autoReplyEnabled: boolean;
  hasActiveAgent: boolean;
  hasActiveKnowledge: boolean;
  /** Injected in tests; production uses getWhatsAppConnectionView. */
  whatsappView?: WhatsAppConnectionView | null;
  workerLiveness?: AiWorkerLiveness;
  queue?: Awaited<ReturnType<typeof getAiWorkerQueueStatus>>;
  now?: Date;
};

const RUNTIME_CACHE_TTL_MS = 15_000;
const runtimeCache = new Map<
  string,
  { at: number; view: WhatsAppConnectionView }
>();

const BACKLOG_PENDING_AGE_SECONDS = 120;
const BACKLOG_EXPIRED_PROCESSING = 1;
const RECENT_FAILED_ATTENTION = 3;

export function clearOperationalHealthCache(): void {
  runtimeCache.clear();
}

async function loadWhatsAppView(
  businessId: string,
  nowMs: number,
): Promise<{ view: WhatsAppConnectionView; cached: boolean }> {
  const hit = runtimeCache.get(businessId);
  if (hit && nowMs - hit.at < RUNTIME_CACHE_TTL_MS) {
    return { view: hit.view, cached: true };
  }
  const view = await getWhatsAppConnectionView({ businessId });
  runtimeCache.set(businessId, { at: nowMs, view });
  return { view, cached: false };
}

export function evaluateOperationalHealth(
  input: {
    businessName: string;
    autoReplyEnabled: boolean;
    hasActiveAgent: boolean;
    hasActiveKnowledge: boolean;
    whatsappView: WhatsAppConnectionView | null;
    worker: AiWorkerLiveness;
    queue: Awaited<ReturnType<typeof getAiWorkerQueueStatus>> | null;
    runtimeProbedAtUtc: Date | null;
    runtimeProbeCached: boolean;
  },
): ReceptionistOperationalHealth {
  const uiState = input.whatsappView?.uiState ?? null;
  const inbound =
    input.whatsappView?.runtime?.inboundDelivery?.health ?? null;

  const base = {
    whatsappLiveState: uiState,
    inboundHealth: inbound,
    worker: input.worker,
    autoReplyEnabled: input.autoReplyEnabled,
    hasActiveAgent: input.hasActiveAgent,
    hasActiveKnowledge: input.hasActiveKnowledge,
    runtimeProbedAtUtc: input.runtimeProbedAtUtc,
    runtimeProbeCached: input.runtimeProbeCached,
  } as const;

  if (!input.hasActiveAgent || !input.hasActiveKnowledge) {
    return {
      ...base,
      overall: "attention",
      attentionCode: "setup_incomplete",
    };
  }

  if (!input.autoReplyEnabled) {
    return {
      ...base,
      overall: "attention",
      attentionCode: "ai_paused",
    };
  }

  if (!input.whatsappView) {
    return {
      ...base,
      overall: "checking",
      attentionCode: "runtime_unknown",
    };
  }

  if (uiState === "ERROR" || uiState === "RUNTIME_DISABLED") {
    return {
      ...base,
      overall: "attention",
      attentionCode: "runtime_error",
    };
  }

  if (uiState !== "READY") {
    // Sticky DB ACTIVE must not reach here — we use live uiState only.
    if (
      uiState === "CONNECTING"
      || uiState === "STARTING"
      || uiState === "QR_REQUIRED"
    ) {
      return {
        ...base,
        overall: "checking",
        attentionCode: "runtime_unknown",
      };
    }
    return {
      ...base,
      overall: "attention",
      attentionCode: "whatsapp_disconnected",
    };
  }

  if (inbound === "degraded") {
    return {
      ...base,
      overall: "attention",
      attentionCode: "inbound_degraded",
    };
  }

  if (inbound === "unknown" || inbound == null) {
    return {
      ...base,
      overall: "checking",
      attentionCode: "runtime_unknown",
    };
  }

  if (input.worker.available === null) {
    return {
      ...base,
      overall: "checking",
      attentionCode: "runtime_unknown",
    };
  }

  if (input.worker.available === false) {
    return {
      ...base,
      overall: "attention",
      attentionCode: "worker_unavailable",
    };
  }

  const queue = input.queue;
  if (queue) {
    if (
      queue.expiredProcessing >= BACKLOG_EXPIRED_PROCESSING
      || (queue.oldestPendingAgeSeconds != null
        && queue.oldestPendingAgeSeconds >= BACKLOG_PENDING_AGE_SECONDS
        && queue.eligiblePending > 0)
    ) {
      return {
        ...base,
        overall: "attention",
        attentionCode: "job_backlog",
      };
    }
    if (queue.recentFailed >= RECENT_FAILED_ATTENTION) {
      return {
        ...base,
        overall: "attention",
        attentionCode: "outbound_failures",
      };
    }
  }

  return {
    ...base,
    overall: "healthy",
    attentionCode: null,
  };
}

/**
 * Server-side health aggregation for one business.
 * Runtime probe is cached briefly to avoid hammering the WhatsApp runtime.
 */
export async function getReceptionistOperationalHealth(
  input: OperationalHealthInput,
): Promise<ReceptionistOperationalHealth> {
  const now = input.now ?? new Date();
  const nowMs = now.getTime();

  let whatsappView = input.whatsappView ?? null;
  let runtimeProbeCached = false;
  let runtimeProbedAtUtc: Date | null = null;

  if (input.whatsappView === undefined) {
    try {
      const loaded = await loadWhatsAppView(input.businessId, nowMs);
      whatsappView = loaded.view;
      runtimeProbeCached = loaded.cached;
      runtimeProbedAtUtc = new Date(nowMs);
    } catch {
      whatsappView = null;
      runtimeProbedAtUtc = new Date(nowMs);
    }
  } else if (input.whatsappView) {
    runtimeProbedAtUtc = now;
  }

  const worker =
    input.workerLiveness
    ?? await getAiWorkerLiveness({
      now,
      staleMs: AI_WORKER_LIVENESS_STALE_MS,
    });

  const queue =
    input.queue
    ?? await getAiWorkerQueueStatus({ businessId: input.businessId }).catch(
      () => null,
    );

  return evaluateOperationalHealth({
    businessName: input.businessName,
    autoReplyEnabled: input.autoReplyEnabled,
    hasActiveAgent: input.hasActiveAgent,
    hasActiveKnowledge: input.hasActiveKnowledge,
    whatsappView,
    worker,
    queue,
    runtimeProbedAtUtc,
    runtimeProbeCached,
  });
}
