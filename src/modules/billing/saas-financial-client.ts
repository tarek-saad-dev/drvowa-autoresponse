import { createHash, createHmac, randomBytes } from "node:crypto";
import { request } from "node:https";
import type { IncomingHttpHeaders } from "node:http";
import { SAAS_FINANCIAL_EVENT_PATH } from "./saas-financial-contract";

export type HubResponse = { status: number; body: string; headers: IncomingHttpHeaders };
export type HubTransport = (endpoint: string, body: Buffer, headers: Record<string, string>) => Promise<HubResponse>;

export function signHubRequest(body: Buffer, timestamp: string, nonce: string, secret: string,
  path: string = SAAS_FINANCIAL_EVENT_PATH): string {
  const digest = createHash("sha256").update(body).digest("hex");
  const canonical = `POST\n${path}\n${timestamp}\n${nonce}\n${digest}`;
  return `sha256=${createHmac("sha256", secret).update(canonical, "utf8").digest("hex")}`;
}

/** No redirects; capped connect, total request, and response size. */
export const hubHttpsTransport: HubTransport = (endpoint, body, headers) => new Promise((resolve, reject) => {
  const url = new URL(endpoint);
  if (url.protocol !== "https:" || ![SAAS_FINANCIAL_EVENT_PATH, "/api/saas-financial/v1/reconciliation/events"].includes(url.pathname)
    || url.search || url.hash || url.username || url.password) {
    reject(new Error("INVALID_HUB_ENDPOINT"));
    return;
  }
  let settled = false;
  const finish = (error?: Error, result?: HubResponse) => {
    if (settled) return;
    settled = true;
    clearTimeout(connectTimer);
    clearTimeout(requestTimer);
    if (error) reject(error);
    else resolve(result!);
  };
  const req = request(url, { method: "POST", headers, agent: false }, (res) => {
    const chunks: Buffer[] = [];
    let size = 0;
    res.on("data", (part: Buffer) => {
      size += part.length;
      if (size > 16_384) {
        req.destroy(new Error("HUB_RESPONSE_TOO_LARGE"));
        return;
      }
      chunks.push(part);
    });
    res.on("end", () => {
      if (!res.complete) return finish(new Error("HUB_RESPONSE_INCOMPLETE"));
      finish(undefined, { status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8"), headers: res.headers });
    });
    res.on("close", () => {
      if (!res.complete) finish(new Error("HUB_RESPONSE_INCOMPLETE"));
    });
    res.on("error", () => finish(new Error("HUB_RESPONSE_ERROR")));
  });
  const connectTimer = setTimeout(() => req.destroy(new Error("HUB_CONNECT_TIMEOUT")), 5_000);
  const requestTimer = setTimeout(() => req.destroy(new Error("HUB_REQUEST_TIMEOUT")), 15_000);
  req.on("socket", (socket) => {
    if (!socket.connecting) clearTimeout(connectTimer);
    else socket.once("secureConnect", () => clearTimeout(connectTimer));
  });
  req.on("error", () => finish(new Error("HUB_TRANSPORT_ERROR")));
  req.end(body);
});

export type DeliveryDecision =
  | { kind: "accepted" }
  | { kind: "retry"; code: string; retryAfterMs?: number }
  | { kind: "review"; code: string };

function retryAfterMs(header: string | string[] | undefined, now: number): number | undefined {
  if (typeof header !== "string") return undefined;
  let delay: number;
  if (/^\d{1,6}$/.test(header)) delay = Number(header) * 1000;
  else {
    const at = Date.parse(header);
    if (!Number.isFinite(at)) return undefined;
    delay = at - now;
  }
  return Math.max(0, Math.min(3_600_000, delay));
}

export function classifyHubResponse(response: HubResponse, eventId: string, now = Date.now()): DeliveryDecision {
  if (response.status === 201 || response.status === 200) {
    let parsed: unknown;
    try { parsed = JSON.parse(response.body); } catch { return { kind: "review", code: "INVALID_SUCCESS" }; }
    // Duplicate JSON keys must not turn a malformed response into an acknowledgement.
    if ((response.body.match(/"event_id"\s*:/g) ?? []).length !== 1
      || (response.body.match(/"duplicate"\s*:/g) ?? []).length !== 1
      || parsed === null || typeof parsed !== "object" || Array.isArray(parsed)
      || Object.keys(parsed).length !== 2
      || (parsed as Record<string, unknown>).event_id !== eventId
      || (parsed as Record<string, unknown>).duplicate !== (response.status === 200)) {
      return { kind: "review", code: "INVALID_SUCCESS" };
    }
    return { kind: "accepted" };
  }
  if (response.status === 429) return {
    kind: "retry", code: "RATE_LIMITED", retryAfterMs: retryAfterMs(response.headers["retry-after"], now),
  };
  if (response.status >= 500 && response.status <= 599) return { kind: "retry", code: "HUB_UNAVAILABLE" };
  if (response.status === 401 || response.status === 403) return { kind: "review", code: "AUTH_OR_SOURCE" };
  if (response.status === 409) return { kind: "review", code: "IDENTITY_CONFLICT" };
  if (response.status === 422) return { kind: "review", code: "INVALID_PAYLOAD" };
  if (response.status >= 300 && response.status <= 399) return { kind: "review", code: "HUB_REDIRECT" };
  return { kind: "review", code: "UNEXPECTED_STATUS" };
}

export function retryDelayMs(attemptCount: number, guidanceMs?: number, random = Math.random): number {
  const base = Math.min(3_600_000, 1_000 * 2 ** Math.min(12, Math.max(0, attemptCount - 1)));
  const jitter = Math.floor(base * (0.5 + random() * 0.5));
  return Math.min(3_600_000, Math.max(jitter, guidanceMs ?? 0));
}

export function createHubClient(config: { endpoint: string; keyId: string; secret: string },
  transport: HubTransport = hubHttpsTransport,
  clock: () => number = Date.now,
  nonceFactory: () => string = () => randomBytes(24).toString("base64url")) {
  return async (payload: string): Promise<HubResponse> => {
    const body = Buffer.from(payload, "utf8");
    if (body.length > 8192) throw new Error("HUB_PAYLOAD_TOO_LARGE");
    const timestamp = String(Math.floor(clock() / 1000));
    const nonce = nonceFactory();
    if (!/^\d{10}$/.test(timestamp) || !/^[A-Za-z0-9_-]{16,100}$/.test(nonce)) {
      throw new Error("INVALID_SIGNING_METADATA");
    }
    return transport(config.endpoint, body, {
      "Content-Type": "application/json", "Content-Length": String(body.length),
      "X-Saas-Key-Id": config.keyId, "X-Saas-Timestamp": timestamp,
      "X-Saas-Nonce": nonce, "X-Saas-Signature": signHubRequest(body, timestamp, nonce, config.secret),
    });
  };
}
