/**
 * Server-only HTTP client for the DRVOWA multi-account WhatsApp runtime.
 * Never expose DRVOWA_RUNTIME_TOKEN to the browser.
 */

/** Safe inbound delivery counters from the managed WhatsApp runtime (no tokens/paths). */
export type RuntimeInboundDelivery = {
  running: boolean;
  pending: number;
  delivered: number;
  failed: number;
  quarantined: number;
  inFlight: boolean;
  lastDeliveryAt: string | null;
  lastErrorCode: string | null;
};

/** Safe Baileys capture counters (no phone/accountKey/body). */
export type RuntimeInboundCapture = {
  rawUpsert: number;
  captured: number;
  unresolvedLid: number;
  decryptFailed: number;
  emptyContent: number;
  quarantined: number;
  pendingLid: number;
  listening: boolean;
  lastEventAt: string | null;
};

export type RuntimeAccountStatus = {
  accountKey: string;
  state: string;
  ready: boolean;
  qrAvailable: boolean;
  lastConnectedAt: string | null;
  lastDisconnectAt: string | null;
  lastDisconnectCode: number | null;
  lastErrorCode: string | null;
  reconnectAttempts: number;
  /** Present on current whatsapp-bot managed status; may be absent on older runtimes. */
  inboundDelivery?: RuntimeInboundDelivery | null;
  inboundCapture?: RuntimeInboundCapture | null;
};

export class WhatsAppRuntimeError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, options: { status: number; code: string }) {
    super(message);
    this.name = "WhatsAppRuntimeError";
    this.status = options.status;
    this.code = options.code;
  }
}

function getBaseUrl(): string {
  const base = process.env.WHATSAPP_RUNTIME_BASE_URL?.trim();
  if (!base) {
    throw new WhatsAppRuntimeError("WhatsApp runtime is not configured", {
      status: 503,
      code: "RUNTIME_NOT_CONFIGURED",
    });
  }
  return base.replace(/\/+$/, "");
}

function getToken(): string {
  const token = process.env.DRVOWA_RUNTIME_TOKEN?.trim();
  if (!token) {
    throw new WhatsAppRuntimeError("WhatsApp runtime token is not configured", {
      status: 503,
      code: "RUNTIME_TOKEN_MISSING",
    });
  }
  return token;
}

function sanitizeRuntimeMessage(message: string): string {
  return message
    .replace(/Bearer\s+\S+/gi, "Bearer [REDACTED]")
    .replace(/token[=:]\s*\S+/gi, "token=[REDACTED]");
}

async function runtimeFetch<T>(
  method: string,
  path: string,
  init?: { timeoutMs?: number; body?: unknown },
): Promise<T> {
  const baseUrl = getBaseUrl();
  const token = getToken();
  const timeoutMs = init?.timeoutMs ?? 8_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: controller.signal,
      cache: "no-store",
    });

    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }

    const record = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
    const errorMessage =
      typeof record.error === "string"
        ? sanitizeRuntimeMessage(record.error)
        : `WhatsApp runtime request failed (${response.status})`;
    const errorCode =
      typeof record.code === "string" ? record.code : `RUNTIME_HTTP_${response.status}`;

    if (!response.ok) {
      throw new WhatsAppRuntimeError(errorMessage, {
        status: response.status,
        code: errorCode,
      });
    }

    return body as T;
  } catch (error) {
    if (error instanceof WhatsAppRuntimeError) {
      throw error;
    }
    if (error instanceof Error && error.name === "AbortError") {
      throw new WhatsAppRuntimeError("WhatsApp runtime timed out", {
        status: 504,
        code: "RUNTIME_TIMEOUT",
      });
    }
    throw new WhatsAppRuntimeError("WhatsApp runtime unavailable", {
      status: 503,
      code: "RUNTIME_UNAVAILABLE",
    });
  } finally {
    clearTimeout(timer);
  }
}

export async function startAccount(
  accountKey: string,
  options?: { runtimeEngine?: "BAILEYS_V6" | "BAILEYS_V7" },
): Promise<RuntimeAccountStatus> {
  const result = await runtimeFetch<{ status: RuntimeAccountStatus }>(
    "POST",
    `/api/accounts/${encodeURIComponent(accountKey)}/start`,
    {
      body: {
        runtimeEngine: options?.runtimeEngine === "BAILEYS_V7" ? "BAILEYS_V7" : "BAILEYS_V6",
      },
    },
  );
  return result.status;
}

export async function stopAccount(
  accountKey: string,
): Promise<RuntimeAccountStatus> {
  const result = await runtimeFetch<{ status: RuntimeAccountStatus }>(
    "POST",
    `/api/accounts/${encodeURIComponent(accountKey)}/stop`,
  );
  return result.status;
}

export async function getAccountStatus(
  accountKey: string,
): Promise<RuntimeAccountStatus> {
  const result = await runtimeFetch<{ status: RuntimeAccountStatus }>(
    "GET",
    `/api/accounts/${encodeURIComponent(accountKey)}/status`,
  );
  return result.status;
}

export async function getAccountQr(accountKey: string): Promise<{
  accountKey: string;
  qr: string | null;
  qrAvailable: boolean;
}> {
  return runtimeFetch(
    "GET",
    `/api/accounts/${encodeURIComponent(accountKey)}/qr`,
    { timeoutMs: 5_000 },
  );
}

export type RuntimeSendResult = {
  success: boolean;
  status?: string;
  messageId?: string | null;
  phone?: string;
  error?: string;
  code?: string;
  originalMessageId?: string | null;
};

async function runtimeFetchWithBody<T>(
  method: string,
  path: string,
  body: unknown,
  init?: { timeoutMs?: number },
): Promise<T> {
  const baseUrl = getBaseUrl();
  const token = getToken();
  const timeoutMs = init?.timeoutMs ?? 8_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
      cache: "no-store",
    });

    let parsed: unknown = null;
    try {
      parsed = await response.json();
    } catch {
      parsed = null;
    }

    const record =
      parsed && typeof parsed === "object"
        ? (parsed as Record<string, unknown>)
        : {};

    if (!response.ok) {
      const errorMessage =
        typeof record.error === "string"
          ? sanitizeRuntimeMessage(record.error)
          : `WhatsApp runtime request failed (${response.status})`;
      const errorCode =
        typeof record.code === "string"
          ? record.code
          : `RUNTIME_HTTP_${response.status}`;
      throw new WhatsAppRuntimeError(errorMessage, {
        status: response.status,
        code: errorCode,
      });
    }

    return parsed as T;
  } catch (error) {
    if (error instanceof WhatsAppRuntimeError) {
      throw error;
    }
    if (error instanceof Error && error.name === "AbortError") {
      throw new WhatsAppRuntimeError("WhatsApp runtime timed out", {
        status: 504,
        code: "RUNTIME_TIMEOUT",
      });
    }
    throw new WhatsAppRuntimeError("WhatsApp runtime unavailable", {
      status: 503,
      code: "RUNTIME_UNAVAILABLE",
    });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Send a text message via managed WhatsApp account.
 * Requires a stable idempotencyKey (AI jobs use ai:<jobId>).
 * Server-only — never expose DRVOWA_RUNTIME_TOKEN to the browser.
 */
export async function sendAccountMessage(params: {
  accountKey: string;
  phone: string;
  message: string;
  idempotencyKey: string;
  timeoutMs?: number;
}): Promise<RuntimeSendResult> {
  if (!params.idempotencyKey.trim()) {
    throw new WhatsAppRuntimeError("idempotencyKey is required", {
      status: 400,
      code: "IDEMPOTENCY_KEY_REQUIRED",
    });
  }

  const result = await runtimeFetchWithBody<RuntimeSendResult>(
    "POST",
    `/api/accounts/${encodeURIComponent(params.accountKey)}/send`,
    {
      phone: params.phone,
      message: params.message,
      idempotencyKey: params.idempotencyKey,
    },
    { timeoutMs: params.timeoutMs ?? 10_000 },
  );

  const status = typeof result.status === "string"
    ? result.status.toLowerCase()
    : "";

  // Normalize duplicate ack into a success shape with original messageId.
  if (status === "duplicate") {
    const original =
      result.originalMessageId
      ?? result.messageId
      ?? null;
    return {
      ...result,
      success: true,
      status: "duplicate",
      messageId: original,
      originalMessageId: original,
    };
  }

  if (status === "sent" && result.messageId) {
    return {
      ...result,
      success: true,
      status: "sent",
    };
  }

  return result;
}
