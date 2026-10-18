import { randomBytes } from "node:crypto";
import { hubHttpsTransport, signHubRequest, type HubTransport } from "./saas-financial-client";
import { isHubIdentifier, parseHubTimestamp, SAAS_FINANCIAL_EVENT_PATH } from "./saas-financial-contract";

export const RECONCILIATION_PATH = "/api/saas-financial/v1/reconciliation/events";
export type InventoryEvent = Readonly<{
  hub_event_id: string; event_id: string; type: "payment.confirmed" | "payment.refunded";
  source_payment_id: string | null; source_refund_id: string | null;
  original_source_payment_id: string | null; amount_minor: string; currency: "EGP" | "USD" | "SAR";
  occurred_at: string; accepted_at: string;
}>;
export type InventoryPage = Readonly<{
  events: InventoryEvent[]; has_more: boolean; next_cursor: string | null;
  scan_upper_hub_event_id: string; scan_started_at: string; source_activated_at: string;
}>;
export type InventoryWindow = { accepted_from: string; accepted_before: string };
const DECIMAL = /^(?:0|[1-9][0-9]*)$/;
const UTC_MICROS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("INVALID_INVENTORY_RESPONSE");
  return value as Record<string, unknown>;
}
function exactKeys(value: Record<string, unknown>, keys: string[]): void {
  if (Object.keys(value).length !== keys.length || Object.keys(value).some(k => !keys.includes(k)))
    throw new Error("INVALID_INVENTORY_RESPONSE");
}
function decimal(value: unknown, positive = false): value is string {
  return typeof value === "string" && value.length <= 20 && DECIMAL.test(value)
    && (!positive || value !== "0");
}
function utc(value: unknown): value is string {
  if (typeof value !== "string" || !UTC_MICROS.test(value)) return false;
  try { return parseHubTimestamp(value).canonical === value; } catch { return false; }
}
function rejectDuplicateJsonKeys(raw: string): void {
  const stack: Array<{ kind: "object"; keys: Set<string> } | { kind: "array" }> = [];
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (c === "{") stack.push({ kind: "object", keys: new Set() });
    else if (c === "[") stack.push({ kind: "array" });
    else if (c === "}" || c === "]") stack.pop();
    else if (c === '"') {
      const start = i++;
      for (; i < raw.length; i++) {
        if (raw[i] === "\\") { i++; continue; }
        if (raw[i] === '"') break;
      }
      if (i >= raw.length) throw new Error("INVALID_INVENTORY_RESPONSE");
      let next = i + 1;
      while (/\s/.test(raw[next] ?? "")) next++;
      const top = stack[stack.length - 1];
      if (raw[next] === ":" && top?.kind === "object") {
        const key = JSON.parse(raw.slice(start, i + 1)) as string;
        if (top.keys.has(key)) throw new Error("INVALID_INVENTORY_RESPONSE");
        top.keys.add(key);
      }
    }
  }
}
export function parseInventoryPage(raw: string): InventoryPage {
  let parsed: unknown;
  try { rejectDuplicateJsonKeys(raw); parsed = JSON.parse(raw); }
  catch { throw new Error("INVALID_INVENTORY_RESPONSE"); }
  const page = object(parsed);
  exactKeys(page, ["events", "has_more", "next_cursor", "scan_upper_hub_event_id", "scan_started_at", "source_activated_at"]);
  if (!Array.isArray(page.events) || page.events.length > 500 || typeof page.has_more !== "boolean"
    || !decimal(page.scan_upper_hub_event_id) || !utc(page.scan_started_at)
    || !utc(page.source_activated_at)
    || (page.has_more ? typeof page.next_cursor !== "string" || !page.next_cursor || page.next_cursor.length > 2048
      : page.next_cursor !== null)) throw new Error("INVALID_INVENTORY_RESPONSE");
  const events = page.events.map(input => {
    const e = object(input);
    exactKeys(e, ["hub_event_id", "event_id", "type", "source_payment_id", "source_refund_id",
      "original_source_payment_id", "amount_minor", "currency", "occurred_at", "accepted_at"]);
    const payment = e.type === "payment.confirmed";
    if ((!payment && e.type !== "payment.refunded") || !decimal(e.hub_event_id, true)
      || !isHubIdentifier(e.event_id) || !decimal(e.amount_minor, true)
      || BigInt(e.amount_minor as string) > BigInt("1000000000000000")
      || !["EGP", "USD", "SAR"].includes(String(e.currency))
      || !utc(e.occurred_at) || !utc(e.accepted_at)
      || (payment
        ? !isHubIdentifier(e.source_payment_id) || e.source_refund_id !== null || e.original_source_payment_id !== null
        : e.source_payment_id !== null || !isHubIdentifier(e.source_refund_id)
          || !isHubIdentifier(e.original_source_payment_id))) throw new Error("INVALID_INVENTORY_RESPONSE");
    return e as InventoryEvent;
  });
  return { ...page, events } as InventoryPage;
}

export function createInventoryClient(config: { endpoint: string; keyId: string; secret: string },
  transport: HubTransport = hubHttpsTransport, clock: () => number = Date.now,
  nonce: () => string = () => randomBytes(24).toString("base64url")) {
  const ingest = new URL(config.endpoint);
  if (ingest.protocol !== "https:" || ingest.pathname !== SAAS_FINANCIAL_EVENT_PATH
    || ingest.search || ingest.hash || ingest.username || ingest.password) throw new Error("INVALID_HUB_ENDPOINT");
  ingest.pathname = RECONCILIATION_PATH;
  const endpoint = ingest.toString();
  return async (request: { limit?: number; cursor?: string } & Partial<InventoryWindow>): Promise<InventoryPage> => {
    if (request.limit !== undefined && (!Number.isInteger(request.limit) || request.limit < 1 || request.limit > 500))
      throw new Error("INVALID_INVENTORY_REQUEST");
    if (request.cursor !== undefined && (typeof request.cursor !== "string" || !request.cursor || request.cursor.length > 2048))
      throw new Error("INVALID_INVENTORY_REQUEST");
    if ((request.accepted_from === undefined) !== (request.accepted_before === undefined)
      || (request.accepted_from !== undefined && (typeof request.accepted_from !== "string"
        || typeof request.accepted_before !== "string"
        || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/.test(request.accepted_from)
        || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/.test(request.accepted_before)
        || parseHubTimestamp(request.accepted_from).epochMicroseconds
          >= parseHubTimestamp(request.accepted_before).epochMicroseconds)))
      throw new Error("INVALID_INVENTORY_REQUEST");
    const body = Buffer.from(JSON.stringify(request), "utf8");
    if (body.length > 8192) throw new Error("INVENTORY_REQUEST_TOO_LARGE");
    const timestamp = String(Math.floor(clock() / 1000));
    const nextNonce = nonce();
    if (!/^\d{10}$/.test(timestamp) || !/^[A-Za-z0-9_-]{16,100}$/.test(nextNonce)) throw new Error("INVALID_SIGNING_METADATA");
    let response;
    try {
      response = await transport(endpoint, body, {
        "Content-Type": "application/json", "Content-Length": String(body.length),
        "X-Saas-Key-Id": config.keyId, "X-Saas-Timestamp": timestamp, "X-Saas-Nonce": nextNonce,
        "X-Saas-Signature": signHubRequest(body, timestamp, nextNonce, config.secret, RECONCILIATION_PATH),
      });
    } catch { throw new Error("INVENTORY_NETWORK_ERROR"); }
    if (response.status !== 200) {
      const code = response.status === 401 || response.status === 403 ? "INVENTORY_AUTH_ERROR"
        : response.status === 429 ? "INVENTORY_RATE_LIMITED"
          : response.status >= 500 ? "INVENTORY_HUB_UNAVAILABLE"
            : response.status === 422 ? "INVENTORY_INVALID_REQUEST" : "INVENTORY_UNEXPECTED_STATUS";
      throw new Error(code);
    }
    if (Buffer.byteLength(response.body, "utf8") > 16_384) throw new Error("INVENTORY_RESPONSE_TOO_LARGE");
    return parseInventoryPage(response.body);
  };
}
