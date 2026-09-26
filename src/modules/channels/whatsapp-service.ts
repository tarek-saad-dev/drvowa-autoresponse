import QRCode from "qrcode";

import { withResourceLimitGate } from "@/modules/billing/entitlements";
import { listLocations } from "@/modules/locations/service";
import type {
  ChannelConnection,
  ChannelConnectionStatus,
  CompatibilityStatus,
  WhatsAppRuntimeEngine,
} from "@/types/domain";

import { generateWhatsAppAccountKey } from "./account-key";
import {
  buildCryptoHealthFromRuntime,
  classifyCompatibility,
  customerCompatibilityMessageAr,
  recommendRuntimeEngine,
} from "./compatibility";
import { mapDbStatusFromRuntime } from "./connection-lifecycle";
import {
  assertMaskedPhoneIsSafe,
  maskWhatsAppPhoneForDisplay,
} from "./phone-mask";
import * as repo from "./repository";
import {
  getAccountQr,
  getAccountStatus,
  startAccount,
  stopAccount,
  WhatsAppRuntimeError,
  type RuntimeAccountStatus,
  type RuntimeInboundDelivery,
} from "./runtime-client";

export type WhatsAppUiState =
  | "NOT_CONNECTED"
  | "STARTING"
  | "QR_REQUIRED"
  | "CONNECTING"
  | "READY"
  | "DISCONNECTED"
  | "LOGGED_OUT"
  | "ERROR"
  | "RUNTIME_DISABLED";

/** Socket can be READY while inbound delivery is unhealthy — surface separately. */
export type InboundReceiveHealth = "healthy" | "degraded" | "unknown";

export type InboundDeliveryView = {
  running: boolean;
  pending: number;
  quarantined: number;
  lastDeliveryAt: string | null;
  lastErrorCode: string | null;
  health: InboundReceiveHealth;
  /** Optional Baileys capture health (safe counters only). */
  capture?: {
    rawUpsert: number;
    captured: number;
    unresolvedLid: number;
    decryptFailed: number;
    emptyContent: number;
    quarantined: number;
    pendingLid: number;
    listening: boolean;
    lastEventAt: string | null;
  } | null;
};

export type WhatsAppConnectionView = {
  connection: ChannelConnection | null;
  uiState: WhatsAppUiState;
  runtime: {
    state: string | null;
    ready: boolean;
    qrAvailable: boolean;
    lastConnectedAt: string | null;
    lastDisconnectAt: string | null;
    lastDisconnectCode: number | null;
    lastErrorCode: string | null;
    reconnectAttempts: number;
    inboundDelivery: InboundDeliveryView | null;
  } | null;
  /**
   * Customer-safe compatibility signal only (no Baileys jargon / counters).
   * Admin diagnostics use a separate admin API.
   */
  compatibility?: {
    status: CompatibilityStatus | null;
    messageAr: string | null;
  };
  /** Never include tokens or accountKey in browser responses from higher layers when not needed */
  message?: string;
};

/** Debounce compatibility DB writes per connection (ms). */
const COMPAT_PERSIST_MIN_INTERVAL_MS = 30_000;
const compatPersistMemory = new Map<
  string,
  { at: number; status: string; reason: string | null; recommended: string | null }
>();

function deriveCompatibilityFromRuntime(
  connection: ChannelConnection,
  runtime: RuntimeAccountStatus,
): {
  status: CompatibilityStatus;
  reason: string;
  recommended: WhatsAppRuntimeEngine;
  crypto: ReturnType<typeof buildCryptoHealthFromRuntime>;
} {
  const engine: WhatsAppRuntimeEngine =
    runtime.runtimeEngine === "BAILEYS_V7" ||
    connection.runtimeEngine === "BAILEYS_V7"
      ? "BAILEYS_V7"
      : "BAILEYS_V6";

  let crypto = buildCryptoHealthFromRuntime(runtime.cryptoHealth);
  if (
    !runtime.cryptoHealth &&
    runtime.inboundCapture &&
    (runtime.inboundCapture.captured > 0 ||
      runtime.inboundCapture.decryptFailed > 0)
  ) {
    crypto = buildCryptoHealthFromRuntime({
      plaintextInboundCount: runtime.inboundCapture.captured,
      decryptFailureCount: runtime.inboundCapture.decryptFailed,
      messageAbsentFromNodeCount:
        runtime.inboundCapture.messageAbsentFromNodeCount ?? 0,
      distinctDecryptFailureMessageIds:
        runtime.inboundCapture.distinctDecryptFailureMessageIds ?? 0,
      lastPlaintextInboundAt:
        runtime.inboundCapture.lastPlaintextInboundAt ??
        runtime.inboundCapture.lastEventAt,
      lastDecryptFailureAt: runtime.inboundCapture.lastDecryptFailureAt ?? null,
      activeFailureStreak: runtime.inboundCapture.activeFailureStreak ?? 0,
      activeFailureDistinctIds:
        runtime.inboundCapture.activeFailureDistinctIds ?? 0,
      failureEpisodeStartedAt:
        runtime.inboundCapture.failureEpisodeStartedAt ?? null,
      status: runtime.compatibilityStatus ?? undefined,
    });
  }

  const classified = classifyCompatibility({
    plaintextInboundCount: crypto.plaintextInboundCount,
    decryptFailureCount: crypto.decryptFailureCount,
    distinctDecryptFailureMessageIds: crypto.distinctDecryptFailureMessageIds,
    activeFailureStreak: crypto.activeFailureStreak,
    activeFailureDistinctIds: crypto.activeFailureDistinctIds,
    failureEpisodeStartedAt: crypto.failureEpisodeStartedAt,
    lastPlaintextInboundAt: crypto.lastPlaintextInboundAt,
    lastDecryptFailureAt: crypto.lastDecryptFailureAt,
    socketReady: runtime.ready,
  });

  // Prefer live runtime status when it matches episode reclassification.
  const fromRuntimeStatus = runtime.compatibilityStatus;
  const status =
    fromRuntimeStatus === classified.status
      ? classified.status
      : classified.status;
  const reason =
    runtime.compatibilityReason && fromRuntimeStatus === classified.status
      ? runtime.compatibilityReason
      : classified.reason;

  const recommended =
    (runtime.recommendedRuntimeEngine === "BAILEYS_V6" ||
    runtime.recommendedRuntimeEngine === "BAILEYS_V7"
      ? runtime.recommendedRuntimeEngine
      : null) ??
    recommendRuntimeEngine({
      compatibilityStatus: status,
      runtimeEngine: engine,
    });

  return {
    status,
    reason,
    recommended,
    crypto,
  };
}

/**
 * Persist compatibility observation with debounce / change detection.
 * Never writes counters. Never mutates RuntimeEngine.
 */
async function maybePersistCompatibility(params: {
  businessId: string;
  connection: ChannelConnection;
  runtime: RuntimeAccountStatus;
}): Promise<ChannelConnection> {
  const derived = deriveCompatibilityFromRuntime(
    params.connection,
    params.runtime,
  );
  const key = params.connection.channelConnectionId;
  const prev = compatPersistMemory.get(key);
  const now = Date.now();
  const unchanged =
    prev &&
    prev.status === derived.status &&
    prev.reason === derived.reason &&
    prev.recommended === derived.recommended;
  const recentlyWritten =
    prev && now - prev.at < COMPAT_PERSIST_MIN_INTERVAL_MS;

  const dbUnchanged =
    params.connection.compatibilityStatus === derived.status &&
    params.connection.compatibilityReason === derived.reason &&
    params.connection.recommendedRuntimeEngine === derived.recommended;

  if (dbUnchanged && (unchanged || recentlyWritten)) {
    return params.connection;
  }
  if (unchanged && recentlyWritten) {
    return params.connection;
  }

  const updated = await repo.updateCompatibilityObservation({
    businessId: params.businessId,
    channelConnectionId: params.connection.channelConnectionId,
    compatibilityStatus: derived.status,
    compatibilityReason: derived.reason,
    recommendedRuntimeEngine: derived.recommended,
  });
  compatPersistMemory.set(key, {
    at: now,
    status: derived.status,
    reason: derived.reason,
    recommended: derived.recommended,
  });
  return updated ?? {
    ...params.connection,
    compatibilityStatus: derived.status,
    compatibilityReason: derived.reason,
    recommendedRuntimeEngine: derived.recommended,
    compatibilityUpdatedAt: new Date(),
  };
}

const INBOUND_CONFIG_ERROR_CODES = new Set([
  "CONFIG_MISSING",
  "AUTH_CONFIG",
  "MAPPING_CONFIG",
]);

/**
 * READY socket ≠ healthy inbound. Degrade when the delivery worker is stopped
 * or last error is a durable config/auth/mapping failure.
 */
export function assessInboundDeliveryHealth(
  inbound: RuntimeInboundDelivery | null | undefined,
  capture?: RuntimeAccountStatus["inboundCapture"] | null,
): InboundReceiveHealth {
  if (!inbound) return "unknown";
  if (!inbound.running) return "degraded";
  const code = inbound.lastErrorCode?.trim() || null;
  if (code && INBOUND_CONFIG_ERROR_CODES.has(code)) return "degraded";
  // Capture stall: Baileys saw upserts but messages were quarantined / stuck on LID / decrypt.
  if (capture) {
    if ((capture.quarantined ?? 0) > 0 && (capture.rawUpsert ?? 0) > (capture.captured ?? 0)) {
      return "degraded";
    }
    if ((capture.decryptFailed ?? 0) > 0 && (capture.rawUpsert ?? 0) > (capture.captured ?? 0)) {
      return "degraded";
    }
    if ((capture.pendingLid ?? 0) > 0 && (capture.listening === false)) {
      return "degraded";
    }
  }
  return "healthy";
}

export function inboundErrorCodeLabelAr(code: string | null | undefined): string | null {
  if (!code?.trim()) return null;
  switch (code.trim()) {
    case "CONFIG_MISSING":
      return "إعدادات استقبال الرسائل غير مكتملة";
    case "AUTH_CONFIG":
      return "مشكلة مصادقة مع خادم الاستقبال";
    case "MAPPING_CONFIG":
      return "ربط رقم واتساب غير متطابق";
    case "NETWORK_ERROR":
      return "مشكلة شبكة مؤقتة أثناء التسليم";
    default:
      return "استقبال الرسائل يحتاج مراجعة";
  }
}

function sanitizeInboundDeliveryView(
  inbound: RuntimeInboundDelivery | null | undefined,
  capture?: RuntimeAccountStatus["inboundCapture"] | null,
): InboundDeliveryView | null {
  if (!inbound) return null;
  const safeCapture = capture
    ? {
        rawUpsert: Number(capture.rawUpsert) || 0,
        captured: Number(capture.captured) || 0,
        unresolvedLid: Number(capture.unresolvedLid) || 0,
        decryptFailed: Number(capture.decryptFailed) || 0,
        emptyContent: Number(capture.emptyContent) || 0,
        quarantined: Number(capture.quarantined) || 0,
        pendingLid: Number(capture.pendingLid) || 0,
        listening: Boolean(capture.listening),
        lastEventAt: capture.lastEventAt ?? null,
      }
    : null;
  return {
    running: Boolean(inbound.running),
    pending: Number(inbound.pending) || 0,
    quarantined: Number(inbound.quarantined) || 0,
    lastDeliveryAt: inbound.lastDeliveryAt ?? null,
    // Safe code only — UI maps to Arabic; never expose HTTP bodies/tokens.
    lastErrorCode: inbound.lastErrorCode ?? null,
    health: assessInboundDeliveryHealth(inbound, capture),
    capture: safeCapture,
  };
}

/**
 * Prefer stored MaskedPhone; otherwise derive a display mask from a business
 * location phone and persist the mask (never the raw number).
 */
export async function resolveWhatsAppMaskedPhone(params: {
  businessId: string;
  connection: ChannelConnection;
}): Promise<ChannelConnection> {
  const existing = params.connection.maskedPhone?.trim() || null;
  if (existing && assertMaskedPhoneIsSafe(existing)) {
    return params.connection;
  }

  const locations = await listLocations({ businessId: params.businessId });
  const rawPhone =
    locations.find((l) => l.isActive && l.phone?.trim())?.phone
    ?? locations.find((l) => l.phone?.trim())?.phone
    ?? null;
  const masked = maskWhatsAppPhoneForDisplay(rawPhone);
  if (!masked || !assertMaskedPhoneIsSafe(masked)) {
    return params.connection;
  }

  const updated = await repo.updateChannelConnection({
    businessId: params.businessId,
    channelConnectionId: params.connection.channelConnectionId,
    maskedPhone: masked,
  });
  return updated ?? { ...params.connection, maskedPhone: masked };
}


function mapUiState(
  connection: ChannelConnection | null,
  runtime: RuntimeAccountStatus | null,
  runtimeError: WhatsAppRuntimeError | null,
): WhatsAppUiState {
  if (runtimeError?.code === "MULTI_ACCOUNT_DISABLED") {
    return "RUNTIME_DISABLED";
  }
  if (runtimeError?.code === "RUNTIME_NOT_CONFIGURED"
    || runtimeError?.code === "RUNTIME_TOKEN_MISSING") {
    return "RUNTIME_DISABLED";
  }
  if (!connection || !connection.externalAccountKey) {
    return "NOT_CONNECTED";
  }
  if (runtimeError) {
    return "ERROR";
  }
  if (!runtime) {
    return connection.status === "ACTIVE" ? "DISCONNECTED" : "NOT_CONNECTED";
  }
  switch (runtime.state) {
    case "READY":
      return "READY";
    case "QR_REQUIRED":
      return "QR_REQUIRED";
    case "STARTING":
      return "STARTING";
    case "CONNECTING":
      return "CONNECTING";
    case "LOGGED_OUT":
      return "LOGGED_OUT";
    case "DISCONNECTED":
      return "DISCONNECTED";
    case "ERROR":
      return "ERROR";
    case "STOPPED":
      return "NOT_CONNECTED";
    default:
      return "CONNECTING";
  }
}

function sanitizeRuntimeView(
  runtime: RuntimeAccountStatus | null,
): WhatsAppConnectionView["runtime"] {
  if (!runtime) return null;
  return {
    state: runtime.state,
    ready: runtime.ready,
    qrAvailable: runtime.qrAvailable,
    lastConnectedAt: runtime.lastConnectedAt,
    lastDisconnectAt: runtime.lastDisconnectAt,
    lastDisconnectCode: runtime.lastDisconnectCode,
    lastErrorCode: runtime.lastErrorCode,
    reconnectAttempts: runtime.reconnectAttempts,
    inboundDelivery: sanitizeInboundDeliveryView(
      runtime.inboundDelivery,
      runtime.inboundCapture,
    ),
  };
}

/**
 * Ensure a single WHATSAPP/BAILEYS ChannelConnection exists for the business,
 * with an immutable ExternalAccountKey. Does not start the runtime.
 */
export async function ensureWhatsAppConnection(params: {
  businessId: string;
}): Promise<ChannelConnection> {
  const existing = await repo.findWhatsAppConnection({
    businessId: params.businessId,
  });
  if (existing) {
    if (existing.externalAccountKey) {
      return existing;
    }
    const accountKey = generateWhatsAppAccountKey();
    const updated = await repo.updateChannelConnection({
      businessId: params.businessId,
      channelConnectionId: existing.channelConnectionId,
      externalAccountKey: accountKey,
    });
    if (!updated) {
      throw new Error("Failed to assign WhatsApp account key");
    }
    return updated;
  }

  return withResourceLimitGate({
    businessId: params.businessId,
    kind: "whatsapp_connection",
    createFn: (trx) =>
      repo.createChannelConnectionShell(
        {
          businessId: params.businessId,
          channel: "WHATSAPP",
          provider: "BAILEYS",
          displayName: "WhatsApp",
          externalAccountKey: generateWhatsAppAccountKey(),
          status: "PENDING",
          isActive: false,
        },
        trx,
      ),
  });
}

async function syncConnectionFromRuntime(params: {
  businessId: string;
  connection: ChannelConnection;
  runtime: RuntimeAccountStatus;
}): Promise<ChannelConnection> {
  const mapped = mapDbStatusFromRuntime(params.runtime.state, {
    status: params.connection.status,
    isActive: params.connection.isActive,
  });
  const updated = await repo.updateChannelConnection({
    businessId: params.businessId,
    channelConnectionId: params.connection.channelConnectionId,
    status: mapped.status,
    isActive: mapped.isActive,
  });
  const base = updated ?? params.connection;
  // Observation-only: persist compatibility with debounce. Never switches engine.
  return maybePersistCompatibility({
    businessId: params.businessId,
    connection: base,
    runtime: params.runtime,
  });
}

function customerCompatibilitySlice(
  connection: ChannelConnection | null,
  uiState: WhatsAppUiState,
): WhatsAppConnectionView["compatibility"] {
  const ready = uiState === "READY";
  const status = connection?.compatibilityStatus ?? null;
  return {
    status,
    messageAr: customerCompatibilityMessageAr(status, ready),
  };
}

function withCustomerCompatibility(
  view: Omit<WhatsAppConnectionView, "compatibility">,
): WhatsAppConnectionView {
  return {
    ...view,
    compatibility: customerCompatibilitySlice(view.connection, view.uiState),
  };
}

export async function getWhatsAppConnectionView(params: {
  businessId: string;
}): Promise<WhatsAppConnectionView> {
  const connection = await repo.findWhatsAppConnection({
    businessId: params.businessId,
  });

  if (!connection?.externalAccountKey) {
    return withCustomerCompatibility({
      connection,
      uiState: "NOT_CONNECTED",
      runtime: null,
    });
  }

  try {
    const runtime = await getAccountStatus(connection.externalAccountKey);
    const synced = await syncConnectionFromRuntime({
      businessId: params.businessId,
      connection,
      runtime,
    });
    const withPhone = await resolveWhatsAppMaskedPhone({
      businessId: params.businessId,
      connection: synced,
    });
    const uiState = mapUiState(withPhone, runtime, null);
    return withCustomerCompatibility({
      connection: withPhone,
      uiState,
      runtime: sanitizeRuntimeView(runtime),
    });
  } catch (error) {
    if (error instanceof WhatsAppRuntimeError) {
      const withPhone = await resolveWhatsAppMaskedPhone({
        businessId: params.businessId,
        connection,
      });
      return withCustomerCompatibility({
        connection: withPhone,
        uiState: mapUiState(withPhone, null, error),
        runtime: null,
        message: error.message,
      });
    }
    throw error;
  }
}

export async function startWhatsAppPairing(params: {
  businessId: string;
}): Promise<WhatsAppConnectionView> {
  const connection = await ensureWhatsAppConnection({
    businessId: params.businessId,
  });
  const accountKey = connection.externalAccountKey;
  if (!accountKey) {
    throw new Error("WhatsApp account key missing");
  }

  try {
    const runtime = await startAccount(accountKey, {
      runtimeEngine: connection.runtimeEngine,
    });
    const synced = await syncConnectionFromRuntime({
      businessId: params.businessId,
      connection,
      runtime,
    });
    const withPhone = await resolveWhatsAppMaskedPhone({
      businessId: params.businessId,
      connection: synced,
    });
    return withCustomerCompatibility({
      connection: withPhone,
      uiState: mapUiState(withPhone, runtime, null),
      runtime: sanitizeRuntimeView(runtime),
    });
  } catch (error) {
    if (error instanceof WhatsAppRuntimeError) {
      // Do not corrupt ChannelConnection on runtime-disabled.
      return withCustomerCompatibility({
        connection,
        uiState: mapUiState(connection, null, error),
        runtime: null,
        message: error.message,
      });
    }
    throw error;
  }
}

export async function stopWhatsAppRuntime(params: {
  businessId: string;
}): Promise<WhatsAppConnectionView> {
  const connection = await repo.findWhatsAppConnection({
    businessId: params.businessId,
  });
  if (!connection?.externalAccountKey) {
    return withCustomerCompatibility({
      connection,
      uiState: "NOT_CONNECTED",
      runtime: null,
    });
  }

  try {
    const runtime = await stopAccount(connection.externalAccountKey);
    const synced = await syncConnectionFromRuntime({
      businessId: params.businessId,
      connection,
      runtime,
    });
    const withPhone = await resolveWhatsAppMaskedPhone({
      businessId: params.businessId,
      connection: synced,
    });
    return withCustomerCompatibility({
      connection: withPhone,
      uiState: mapUiState(withPhone, runtime, null),
      runtime: sanitizeRuntimeView(runtime),
    });
  } catch (error) {
    if (error instanceof WhatsAppRuntimeError) {
      return withCustomerCompatibility({
        connection,
        uiState: mapUiState(connection, null, error),
        runtime: null,
        message: error.message,
      });
    }
    throw error;
  }
}

export async function getWhatsAppQrForBusiness(params: {
  businessId: string;
}): Promise<{
  uiState: WhatsAppUiState;
  qrAvailable: boolean;
  qrImageDataUrl: string | null;
  message?: string;
}> {
  const connection = await repo.findWhatsAppConnection({
    businessId: params.businessId,
  });
  if (!connection?.externalAccountKey) {
    return { uiState: "NOT_CONNECTED", qrAvailable: false, qrImageDataUrl: null };
  }

  try {
    const status = await getAccountStatus(connection.externalAccountKey);
    if (status.state === "READY" || status.ready) {
      await syncConnectionFromRuntime({
        businessId: params.businessId,
        connection,
        runtime: status,
      });
      return { uiState: "READY", qrAvailable: false, qrImageDataUrl: null };
    }

    const qr = await getAccountQr(connection.externalAccountKey);
    if (!qr.qr) {
      return {
        uiState: mapUiState(connection, status, null),
        qrAvailable: false,
        qrImageDataUrl: null,
      };
    }

    // Ephemeral image for authorized browser only — never persisted/logged.
    const qrImageDataUrl = await QRCode.toDataURL(qr.qr, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 280,
    });

    return {
      uiState: "QR_REQUIRED",
      qrAvailable: true,
      qrImageDataUrl,
    };
  } catch (error) {
    if (error instanceof WhatsAppRuntimeError) {
      return {
        uiState: mapUiState(connection, null, error),
        qrAvailable: false,
        qrImageDataUrl: null,
        message: error.message,
      };
    }
    throw error;
  }
}

/** Test/helper: resolve DB-owned account key for a business (never from browser). */
export async function getTrustedAccountKey(params: {
  businessId: string;
}): Promise<string | null> {
  const connection = await repo.findWhatsAppConnection({
    businessId: params.businessId,
  });
  return connection?.externalAccountKey ?? null;
}
