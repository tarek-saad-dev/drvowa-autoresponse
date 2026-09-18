import QRCode from "qrcode";

import type { ChannelConnection, ChannelConnectionStatus } from "@/types/domain";

import { generateWhatsAppAccountKey } from "./account-key";
import * as repo from "./repository";
import {
  getAccountQr,
  getAccountStatus,
  startAccount,
  stopAccount,
  WhatsAppRuntimeError,
  type RuntimeAccountStatus,
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
  } | null;
  /** Never include tokens or accountKey in browser responses from higher layers when not needed */
  message?: string;
};

function mapDbStatusFromRuntime(state: string): {
  status: ChannelConnectionStatus;
  isActive: boolean;
} {
  switch (state) {
    case "READY":
      return { status: "ACTIVE", isActive: true };
    case "LOGGED_OUT":
      return { status: "DISCONNECTED", isActive: false };
    case "ERROR":
      return { status: "ERROR", isActive: false };
    case "DISCONNECTED":
      return { status: "DISCONNECTED", isActive: false };
    case "QR_REQUIRED":
    case "STARTING":
    case "CONNECTING":
      return { status: "PENDING", isActive: false };
    default:
      return { status: "PENDING", isActive: false };
  }
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

  return repo.createChannelConnectionShell({
    businessId: params.businessId,
    channel: "WHATSAPP",
    provider: "BAILEYS",
    displayName: "WhatsApp",
    externalAccountKey: generateWhatsAppAccountKey(),
    status: "PENDING",
    isActive: false,
  });
}

async function syncConnectionFromRuntime(params: {
  businessId: string;
  connection: ChannelConnection;
  runtime: RuntimeAccountStatus;
}): Promise<ChannelConnection> {
  const mapped = mapDbStatusFromRuntime(params.runtime.state);
  const updated = await repo.updateChannelConnection({
    businessId: params.businessId,
    channelConnectionId: params.connection.channelConnectionId,
    status: mapped.status,
    isActive: mapped.isActive,
  });
  return updated ?? params.connection;
}

export async function getWhatsAppConnectionView(params: {
  businessId: string;
}): Promise<WhatsAppConnectionView> {
  const connection = await repo.findWhatsAppConnection({
    businessId: params.businessId,
  });

  if (!connection?.externalAccountKey) {
    return {
      connection,
      uiState: "NOT_CONNECTED",
      runtime: null,
    };
  }

  try {
    const runtime = await getAccountStatus(connection.externalAccountKey);
    const synced = await syncConnectionFromRuntime({
      businessId: params.businessId,
      connection,
      runtime,
    });
    return {
      connection: synced,
      uiState: mapUiState(synced, runtime, null),
      runtime: sanitizeRuntimeView(runtime),
    };
  } catch (error) {
    if (error instanceof WhatsAppRuntimeError) {
      return {
        connection,
        uiState: mapUiState(connection, null, error),
        runtime: null,
        message: error.message,
      };
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
    const runtime = await startAccount(accountKey);
    const synced = await syncConnectionFromRuntime({
      businessId: params.businessId,
      connection,
      runtime,
    });
    return {
      connection: synced,
      uiState: mapUiState(synced, runtime, null),
      runtime: sanitizeRuntimeView(runtime),
    };
  } catch (error) {
    if (error instanceof WhatsAppRuntimeError) {
      // Do not corrupt ChannelConnection on runtime-disabled.
      return {
        connection,
        uiState: mapUiState(connection, null, error),
        runtime: null,
        message: error.message,
      };
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
    return {
      connection,
      uiState: "NOT_CONNECTED",
      runtime: null,
    };
  }

  try {
    const runtime = await stopAccount(connection.externalAccountKey);
    const synced = await syncConnectionFromRuntime({
      businessId: params.businessId,
      connection,
      runtime,
    });
    return {
      connection: synced,
      uiState: mapUiState(synced, runtime, null),
      runtime: sanitizeRuntimeView(runtime),
    };
  } catch (error) {
    if (error instanceof WhatsAppRuntimeError) {
      return {
        connection,
        uiState: mapUiState(connection, null, error),
        runtime: null,
        message: error.message,
      };
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
