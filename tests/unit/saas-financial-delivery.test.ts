import { createHash, createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  classifyHubResponse, createHubClient, retryDelayMs, signHubRequest, type HubResponse,
} from "../../src/modules/billing/saas-financial-client";
import {
  createFinancialWorker, deliverFinancialClaim, resolveHubSecret,
} from "../../src/modules/billing/saas-financial-worker";
import type { FinancialClaim } from "../../src/modules/billing/saas-financial-delivery-repository";
import { readSaasFinancialConfig } from "../../src/modules/billing/saas-financial-config";

const event = {
  schema_version: 1, event_id: "event-1", type: "payment.confirmed",
  source_payment_id: "payment-1", amount_minor: 123, currency: "EGP",
  occurred_at: "2020-10-18T10:00:00.000000Z",
};
const payload = JSON.stringify(event);
const claim: FinancialClaim = {
  eventId: event.event_id, sourcePaymentId: event.source_payment_id,
  payload, amountMinor: "123", currency: "EGP", leaseToken: "lease-1", attemptCount: 1,
};
const response = (status: number, body = "", headers: Record<string, string> = {}): HubResponse =>
  ({ status, body, headers });

describe("financial Hub signing and classification", () => {
  it("hashes the exact raw bytes and signs four LF-separated canonical lines", () => {
    const raw = Buffer.from('{ "event_id" : "é" }', "utf8");
    const canonical = `POST\n/api/saas-financial/v1/events\n1792317600\nabcdefghijklmnop\n${createHash("sha256").update(raw).digest("hex")}`;
    expect(signHubRequest(raw, "1792317600", "abcdefghijklmnop", "test-only-secret"))
      .toBe(`sha256=${createHmac("sha256", "test-only-secret").update(canonical).digest("hex")}`);
  });

  it("uses fresh signing metadata with identical payload bytes on retry", async () => {
    let time = 1_792_317_600_000;
    let nonce = 0;
    const sent: { body: string; headers: Record<string, string> }[] = [];
    const client = createHubClient({ endpoint: "https://hub.example.com/api/saas-financial/v1/events",
      keyId: "key-1", secret: "test-only-secret" },
    async (_url, body, headers) => {
      sent.push({ body: body.toString("utf8"), headers });
      return response(503);
    }, () => time, () => `nonce${String(++nonce).padStart(20, "0")}`);
    await client(payload);
    time += 1000;
    await client(payload);
    expect(sent.map(x => x.body)).toEqual([payload, payload]);
    expect(sent[0].headers["X-Saas-Nonce"]).not.toBe(sent[1].headers["X-Saas-Nonce"]);
    expect(sent[0].headers["X-Saas-Timestamp"]).not.toBe(sent[1].headers["X-Saas-Timestamp"]);
    expect(sent[0].headers["X-Saas-Signature"]).not.toBe(sent[1].headers["X-Saas-Signature"]);
    expect(sent[0].headers["Content-Length"]).toBe(String(Buffer.byteLength(payload)));
  });

  it("accepts only matching 201/new and 200/duplicate identities", () => {
    expect(classifyHubResponse(response(201, '{"event_id":"event-1","duplicate":false}'), "event-1"))
      .toEqual({ kind: "accepted" });
    expect(classifyHubResponse(response(200, '{"event_id":"event-1","duplicate":true}'), "event-1"))
      .toEqual({ kind: "accepted" });
    for (const invalid of [
      response(201, '{"event_id":"other","duplicate":false}'),
      response(201, '{"event_id":"event-1","duplicate":true}'),
      response(200, '{"event_id":"event-1","duplicate":false}'),
      response(200, '{"event_id":"other","event_id":"event-1","duplicate":true}'),
      response(200, "not json"), response(204, ""),
    ]) expect(classifyHubResponse(invalid, "event-1").kind).toBe("review");
  });

  it("classifies transient and operator review responses with bounded retry guidance", () => {
    expect(classifyHubResponse(response(503), "event-1").kind).toBe("retry");
    expect(classifyHubResponse(response(429, "", { "retry-after": "999999" }), "event-1"))
      .toEqual({ kind: "retry", code: "RATE_LIMITED", retryAfterMs: 3_600_000 });
    for (const status of [301, 401, 403, 409, 422]) {
      expect(classifyHubResponse(response(status), "event-1").kind).toBe("review");
    }
    expect(retryDelayMs(1, undefined, () => 0)).toBe(500);
    expect(retryDelayMs(1000, undefined, () => 1)).toBe(3_600_000);
  });
});

describe("financial worker decisions", () => {
  const activatedAt = "2020-10-17T00:00:00.000000Z";
  const logger = { info: vi.fn(), warn: vi.fn() };

  it("preserves the event after an uncertain response and confirms an idempotent replay", async () => {
    const settle = vi.fn().mockResolvedValue(true);
    await deliverFinancialClaim(claim, activatedAt, async () => { throw new Error("private transport detail"); },
      settle, logger);
    expect(settle.mock.calls[0][1]).toMatchObject({ state: "PENDING", errorCode: "UNCERTAIN_RESPONSE" });
    await deliverFinancialClaim({ ...claim, attemptCount: 2 }, activatedAt,
      async () => response(200, '{"event_id":"event-1","duplicate":true}'), settle, logger);
    expect(settle.mock.calls[1][1]).toEqual({ state: "ACCEPTED", errorCode: null });
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain("private transport detail");
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain(payload);
  });

  it("holds mismatched success and invalid local payloads for review", async () => {
    const settle = vi.fn().mockResolvedValue(true);
    await deliverFinancialClaim(claim, activatedAt,
      async () => response(201, '{"event_id":"other","duplicate":false}'), settle, logger);
    expect(settle.mock.calls[0][1]).toEqual({ state: "DEAD", errorCode: "INVALID_SUCCESS" });
    const send = vi.fn();
    await deliverFinancialClaim({ ...claim, payload: payload.replace("123", "124") }, activatedAt,
      send, settle, logger);
    expect(send).not.toHaveBeenCalled();
    expect(settle.mock.calls[1][1]).toEqual({ state: "DEAD", errorCode: "LOCAL_PAYLOAD_INVALID" });
  });

  it("never claims or sends when disabled", async () => {
    const claimFn = vi.fn();
    const send = vi.fn();
    const worker = createFinancialWorker({ env: {}, claim: claimFn, send, logger });
    await worker.loop();
    expect(claimFn).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("rejects unavailable or reused credentials without exposing the secret", () => {
    const env = {
      DRVO_SAAS_FINANCIAL_ENDPOINT: "https://hub.example.com/api/saas-financial/v1/events",
      DRVO_SAAS_FINANCIAL_SOURCE_KEY: "test-source",
      DRVO_SAAS_FINANCIAL_SOURCE_STATUS: "active",
      DRVO_SAAS_FINANCIAL_SOURCE_ACTIVATED_AT: "2026-10-17T00:00:00Z",
      DRVO_SAAS_FINANCIAL_CAPTURE_CUTOFF_AT: "2026-10-17T00:00:00Z",
      DRVO_SAAS_FINANCIAL_CAPTURE_ENABLED: "1",
      DRVO_SAAS_FINANCIAL_DELIVERY_ENABLED: "1",
      DRVO_SAAS_FINANCIAL_CREDENTIAL_KEY_ID: "key-1",
      DRVO_SAAS_FINANCIAL_CREDENTIAL_SECRET_REF: "env:FINANCIAL_HUB_TEST_SECRET",
    };
    const config = readSaasFinancialConfig(env);
    expect(() => resolveHubSecret(config, env)).toThrow("HUB_SECRET_UNAVAILABLE");
    expect(resolveHubSecret(config, { ...env, FINANCIAL_HUB_TEST_SECRET: "only-in-test" })).toBe("only-in-test");
    expect(() => resolveHubSecret({ ...config, credentialSecretRef: "env:DRVO_GROUP_FINANCE_EXPORT_TOKEN" },
      { DRVO_GROUP_FINANCE_EXPORT_TOKEN: "forbidden" })).toThrow("FINANCE_EXPORT_TOKEN_REUSE");
    expect(() => resolveHubSecret(config, { ...env, FINANCIAL_HUB_TEST_SECRET: "same-value",
      DRVO_GROUP_FINANCE_EXPORT_TOKEN: "same-value" })).toThrow("FINANCE_EXPORT_TOKEN_REUSE");
  });
});
