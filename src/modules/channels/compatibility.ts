/**
 * Pure WhatsApp compatibility classifier (Phase 1 — observation only).
 * Mirrors runtime services/drvowa/compatibilityClassifier.js.
 *
 * Lifetime decryptFailureCount is diagnostic only.
 * Classification uses active failure episode:
 *   activeFailureStreak, activeFailureDistinctIds, failureEpisodeStartedAt
 *
 * DEGRADED_CRYPTO: READY + streak≥3 + distinct≥2 + recent episode + no plaintext recovery.
 * Plaintext after episode → HEALTHY (clears active streak).
 * Does not mutate runtimeEngine.
 */

import type {
  CompatibilityStatus,
  WhatsAppRuntimeEngine,
} from "@/types/domain";

export type { CompatibilityStatus };

export const DEGRADED_MIN_FAILURES = 3;
export const DEGRADED_MIN_DISTINCT_IDS = 2;
export const EPISODE_MAX_AGE_MS = 30 * 60 * 1000;

export type CryptoHealthCounters = {
  plaintextInboundCount: number;
  decryptFailureCount: number;
  messageAbsentFromNodeCount: number;
  distinctDecryptFailureMessageIds?: number;
  lastPlaintextInboundAt?: string | null;
  lastDecryptFailureAt?: string | null;
  activeFailureStreak?: number;
  activeFailureDistinctIds?: number;
  failureEpisodeStartedAt?: string | null;
};

function parseIsoMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const t = Date.parse(String(value));
  return Number.isFinite(t) ? t : null;
}

function resolveActiveEpisode(
  input: {
    activeFailureStreak?: number;
    consecutiveUnrecoveredDecryptFailures?: number;
    activeFailureDistinctIds?: number;
    distinctDecryptFailureMessageIds?: number;
    failureEpisodeStartedAt?: string | null;
    lastPlaintextInboundAt?: string | null;
    lastDecryptFailureAt?: string | null;
  },
  nowMs: number,
) {
  const lastPlainMs = parseIsoMs(input.lastPlaintextInboundAt);
  const lastFailMs = parseIsoMs(input.lastDecryptFailureAt);
  const episodeStartMs = parseIsoMs(input.failureEpisodeStartedAt ?? null);

  const hasExplicitStreak =
    input.activeFailureStreak != null ||
    input.consecutiveUnrecoveredDecryptFailures != null;

  let activeFailureStreak = Math.max(
    0,
    Number(
      input.activeFailureStreak ??
        input.consecutiveUnrecoveredDecryptFailures ??
        0,
    ) || 0,
  );
  let activeFailureDistinctIds = Math.max(
    0,
    Number(
      input.activeFailureDistinctIds ??
        input.distinctDecryptFailureMessageIds ??
        0,
    ) || 0,
  );

  const recoveredByPlaintext = Boolean(
    lastPlainMs &&
      ((lastFailMs && lastPlainMs >= lastFailMs) ||
        (episodeStartMs && lastPlainMs >= episodeStartMs)),
  );

  if (recoveredByPlaintext) {
    return {
      activeFailureStreak: 0,
      activeFailureDistinctIds: 0,
      episodeRecent: false,
      recoveredByPlaintext: true,
    };
  }

  if (!hasExplicitStreak) {
    // Do not invent DEGRADED from lifetime totals alone.
    return {
      activeFailureStreak: 0,
      activeFailureDistinctIds: 0,
      episodeRecent: false,
      recoveredByPlaintext: false,
    };
  }

  const startMs = episodeStartMs || lastFailMs;
  const episodeAgeMs = startMs != null ? Math.max(0, nowMs - startMs) : null;
  const episodeRecent =
    episodeAgeMs != null && episodeAgeMs <= EPISODE_MAX_AGE_MS;

  return {
    activeFailureStreak: episodeRecent ? activeFailureStreak : 0,
    activeFailureDistinctIds: episodeRecent ? activeFailureDistinctIds : 0,
    episodeRecent,
    recoveredByPlaintext: false,
  };
}

export function classifyCompatibility(input: {
  plaintextInboundCount?: number;
  decryptFailureCount?: number;
  messageAbsentFromNodeCount?: number;
  distinctDecryptFailureMessageIds?: number;
  activeFailureStreak?: number;
  consecutiveUnrecoveredDecryptFailures?: number;
  activeFailureDistinctIds?: number;
  failureEpisodeStartedAt?: string | null;
  lastPlaintextInboundAt?: string | null;
  lastDecryptFailureAt?: string | null;
  socketReady?: boolean;
  nowMs?: number;
}): { status: CompatibilityStatus; reason: string } {
  const plaintext = Math.max(0, Number(input.plaintextInboundCount) || 0);
  const lifetimeFailures = Math.max(0, Number(input.decryptFailureCount) || 0);
  const socketReady = Boolean(input.socketReady);
  const nowMs = Number.isFinite(input.nowMs) ? (input.nowMs as number) : Date.now();
  const episode = resolveActiveEpisode(input, nowMs);

  if (
    plaintext === 0 &&
    lifetimeFailures === 0 &&
    episode.activeFailureStreak === 0
  ) {
    return { status: "UNKNOWN", reason: "insufficient_inbound_evidence" };
  }

  if (episode.recoveredByPlaintext && plaintext > 0) {
    return {
      status: "HEALTHY",
      reason: "plaintext_recovery_cleared_failure_episode",
    };
  }

  if (plaintext > 0 && episode.activeFailureStreak === 0) {
    return { status: "HEALTHY", reason: "plaintext_inbound_ok" };
  }

  if (!socketReady && episode.activeFailureStreak > 0) {
    return {
      status: "SUSPECT",
      reason: "socket_not_ready_crypto_deferred",
    };
  }

  if (episode.activeFailureStreak > 0 && episode.episodeRecent === false) {
    if (plaintext > 0) {
      return {
        status: "HEALTHY",
        reason: "stale_failure_episode_ignored_after_plaintext",
      };
    }
    return {
      status: "SUSPECT",
      reason: "stale_failure_episode_ignored",
    };
  }

  if (
    socketReady &&
    episode.episodeRecent &&
    episode.activeFailureStreak >= DEGRADED_MIN_FAILURES &&
    episode.activeFailureDistinctIds >= DEGRADED_MIN_DISTINCT_IDS
  ) {
    return {
      status: "DEGRADED_CRYPTO",
      reason: `active_episode_failures_${episode.activeFailureStreak}_distinct_${episode.activeFailureDistinctIds}`,
    };
  }

  if (episode.activeFailureStreak === 1) {
    return { status: "SUSPECT", reason: "single_active_decrypt_failure" };
  }
  if (episode.activeFailureStreak > 0) {
    return {
      status: "SUSPECT",
      reason: "active_failures_below_degraded_threshold",
    };
  }
  if (plaintext > 0) {
    return { status: "HEALTHY", reason: "plaintext_inbound_ok" };
  }
  if (lifetimeFailures > 0) {
    return {
      status: "SUSPECT",
      reason: "historical_failures_no_active_episode",
    };
  }
  return { status: "UNKNOWN", reason: "insufficient_inbound_evidence" };
}

export function recommendRuntimeEngine(input: {
  compatibilityStatus: CompatibilityStatus;
  runtimeEngine: WhatsAppRuntimeEngine;
}): WhatsAppRuntimeEngine {
  const engine =
    input.runtimeEngine === "BAILEYS_V7" ? "BAILEYS_V7" : "BAILEYS_V6";
  if (
    input.compatibilityStatus === "DEGRADED_CRYPTO" &&
    engine === "BAILEYS_V6"
  ) {
    return "BAILEYS_V7";
  }
  return engine;
}

export function customerCompatibilityMessageAr(
  status: CompatibilityStatus | null | undefined,
  uiReady: boolean,
): string | null {
  if (!uiReady) return null;
  switch (status) {
    case "UNKNOWN":
    case "SUSPECT":
      return "متصل — جاري التحقق من جودة استقبال الرسائل";
    case "DEGRADED_CRYPTO":
      return "الاتصال يحتاج تهيئة إضافية لتحسين استقبال الرسائل";
    case "HEALTHY":
    default:
      return null;
  }
}

export function adminCompatibilityLabel(
  status: CompatibilityStatus | null | undefined,
): string {
  switch (status) {
    case "HEALTHY":
      return "Healthy";
    case "SUSPECT":
      return "Needs review";
    case "DEGRADED_CRYPTO":
      return "Crypto incompatible";
    case "UNKNOWN":
    default:
      return "Unknown";
  }
}

export function buildCryptoHealthFromRuntime(crypto: {
  status?: string;
  cryptoHealth?: string;
  plaintextInboundCount?: number;
  decryptFailureCount?: number;
  messageAbsentFromNodeCount?: number;
  distinctDecryptFailureMessageIds?: number;
  lastPlaintextInboundAt?: string | null;
  lastDecryptFailureAt?: string | null;
  activeFailureStreak?: number;
  activeFailureDistinctIds?: number;
  failureEpisodeStartedAt?: string | null;
} | null | undefined): CryptoHealthCounters & { status: CompatibilityStatus } {
  const plaintextInboundCount = Math.max(
    0,
    Number(crypto?.plaintextInboundCount) || 0,
  );
  const decryptFailureCount = Math.max(
    0,
    Number(crypto?.decryptFailureCount) || 0,
  );
  const messageAbsentFromNodeCount = Math.max(
    0,
    Number(crypto?.messageAbsentFromNodeCount) || 0,
  );
  const classified = classifyCompatibility({
    plaintextInboundCount,
    decryptFailureCount,
    messageAbsentFromNodeCount,
    distinctDecryptFailureMessageIds:
      crypto?.distinctDecryptFailureMessageIds,
    activeFailureStreak: crypto?.activeFailureStreak,
    activeFailureDistinctIds: crypto?.activeFailureDistinctIds,
    failureEpisodeStartedAt: crypto?.failureEpisodeStartedAt,
    lastPlaintextInboundAt: crypto?.lastPlaintextInboundAt,
    lastDecryptFailureAt: crypto?.lastDecryptFailureAt,
    socketReady: true,
  });
  const raw = String(crypto?.status || crypto?.cryptoHealth || "").toUpperCase();
  const known: CompatibilityStatus[] = [
    "UNKNOWN",
    "HEALTHY",
    "SUSPECT",
    "DEGRADED_CRYPTO",
  ];
  // Prefer reclassification from episode fields over stale runtime status string.
  const status = classified.status;
  void known;
  void raw;

  return {
    status,
    plaintextInboundCount,
    decryptFailureCount,
    messageAbsentFromNodeCount,
    distinctDecryptFailureMessageIds: Math.max(
      0,
      Number(crypto?.distinctDecryptFailureMessageIds) || 0,
    ),
    lastPlaintextInboundAt: crypto?.lastPlaintextInboundAt ?? null,
    lastDecryptFailureAt: crypto?.lastDecryptFailureAt ?? null,
    activeFailureStreak: Math.max(0, Number(crypto?.activeFailureStreak) || 0),
    activeFailureDistinctIds: Math.max(
      0,
      Number(crypto?.activeFailureDistinctIds) || 0,
    ),
    failureEpisodeStartedAt: crypto?.failureEpisodeStartedAt ?? null,
  };
}
