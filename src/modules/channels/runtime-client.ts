/**
 * Server-only HTTP client for the DRVOWA multi-account WhatsApp runtime.
 * Never expose DRVOWA_RUNTIME_TOKEN to the browser.
 */

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
): Promise<RuntimeAccountStatus> {
  const result = await runtimeFetch<{ status: RuntimeAccountStatus }>(
    "POST",
    `/api/accounts/${encodeURIComponent(accountKey)}/start`,
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
