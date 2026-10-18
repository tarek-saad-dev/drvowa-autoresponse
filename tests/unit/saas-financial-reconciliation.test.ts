import { createHash, createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createInventoryClient, parseInventoryPage, type InventoryEvent, type InventoryPage }
  from "../../src/modules/billing/saas-financial-reconciliation-client";
import { compareFinancialEvidence, type Approval, type Outbox }
  from "../../src/modules/billing/saas-financial-reconciliation-compare";
import { runFinancialReconciliation } from "../../src/modules/billing/saas-financial-reconciliation-runner";
import type { ScanRun } from "../../src/modules/billing/saas-financial-reconciliation-repository";

const activation = "2026-10-17T00:00:00.000000Z";
const cutoff = "2026-10-17T00:00:00.000000Z";
const uuid = "9e921ec1-e38e-4420-bd3e-6abeaef494f5";
const eventId = `autorespond:payment.confirmed:${uuid}`;
const paymentId = `autorespond:manual-payment:${uuid}`;
const occurred = "2026-10-18T10:00:00.123000Z";
const hubEvent: InventoryEvent = {
  hub_event_id: "9007199254740993", event_id: eventId, type: "payment.confirmed",
  source_payment_id: paymentId, source_refund_id: null, original_source_payment_id: null,
  amount_minor: "1000000000000000", currency: "EGP", occurred_at: occurred,
  accepted_at: "2026-10-18T10:01:00.000000Z",
};
const approval: Approval = {
  paymentRequestId: uuid, method: "INSTAPAY", amountText: "9999999999.99", currency: "EGP",
  reviewedAtText: "2026-10-18T10:00:00.1230000", reviewedByUserId: "reviewer",
  approvedSubscriptionId: "subscription",
};
const outbox: Outbox = {
  eventId, sourcePaymentId: paymentId, paymentRequestId: uuid, amountMinor: "999999999999",
  currency: "EGP", occurredAtText: occurred, state: "ACCEPTED",
  payload: JSON.stringify({ schema_version: 1, event_id: eventId, type: "payment.confirmed",
    source_payment_id: paymentId,
    amount_minor: 999999999999, currency: "EGP", occurred_at: occurred }),
};
const page = (events: InventoryEvent[], has_more = false, next_cursor: string | null = null): InventoryPage => ({
  events, has_more, next_cursor, scan_upper_hub_event_id: "9007199254740993",
  scan_started_at: "2026-10-18T11:00:00.000000Z", source_activated_at: activation,
});
const env = {
  DRVO_SAAS_FINANCIAL_ENDPOINT: "https://hub.example.com/api/saas-financial/v1/events",
  DRVO_SAAS_FINANCIAL_SOURCE_KEY: "autorespond",
  DRVO_SAAS_FINANCIAL_SOURCE_STATUS: "active",
  DRVO_SAAS_FINANCIAL_SOURCE_ACTIVATED_AT: activation,
  DRVO_SAAS_FINANCIAL_CAPTURE_CUTOFF_AT: cutoff,
  DRVO_SAAS_FINANCIAL_CAPTURE_ENABLED: "1",
  DRVO_SAAS_FINANCIAL_RECONCILIATION_ENABLED: "1",
  DRVO_SAAS_FINANCIAL_CREDENTIAL_KEY_ID: "key1",
  DRVO_SAAS_FINANCIAL_CREDENTIAL_SECRET_REF: "env:HUB_TEST_SECRET",
  HUB_TEST_SECRET: "test-only-secret",
};
const scanRun: ScanRun = {
  RunID: "e7fbc43c-f5b8-4f28-8805-e96f2be288e5", SourceKey: "autorespond",
  Status: "SCANNING", PagesRead: 0, EventsRead: 0, TraversalComplete: false,
  NextCursor: null, ScanUpperHubEventID: null, HubScanStartedAtText: null,
  AcceptedFromText: null, AcceptedBeforeText: null,
  SourceActivatedText: activation.slice(0,-1), CaptureCutoffText: cutoff.slice(0,-1),
  StartedAtUtc: new Date(), UpdatedAtUtc: new Date(),
};
const silent = { info: vi.fn(), warn: vi.fn() };
const baseDeps = () => ({
  begin: vi.fn().mockResolvedValue({ ...scanRun }),
  record: vi.fn().mockResolvedValue(undefined),
  local: vi.fn().mockResolvedValue({ approvals: [], outbox: [] }),
  observed: vi.fn().mockResolvedValue([]),
  finish: vi.fn().mockResolvedValue(undefined),
  state: vi.fn().mockResolvedValue(undefined),
  fetch: vi.fn().mockResolvedValue(page([])),
  close: vi.fn().mockResolvedValue(undefined),
  sleep: vi.fn().mockResolvedValue(undefined),
  logger: silent,
});

describe("reconciliation inventory contract", () => {
  it("signs exact transmitted bytes for the separate path with fresh metadata", async () => {
    const seen: { body: Buffer; headers: Record<string,string>; endpoint: string }[] = [];
    let second = 1_792_317_600_000, nonce = 0;
    const client = createInventoryClient({ endpoint: env.DRVO_SAAS_FINANCIAL_ENDPOINT,
      keyId: "key1", secret: "test-only-secret" },
    async (endpoint, body, headers) => {
      seen.push({ endpoint, body, headers });
      return { status: 200, body: JSON.stringify(page([])), headers: {} };
    }, () => second, () => `nonce${String(++nonce).padStart(20, "0")}`);
    await client({});
    second += 1000;
    await client({ limit: 20 });
    expect(seen[0].body.toString()).toBe("{}");
    expect(seen[0].endpoint).toBe("https://hub.example.com/api/saas-financial/v1/reconciliation/events");
    const headers = seen[0].headers;
    const canonical = `POST\n/api/saas-financial/v1/reconciliation/events\n${headers["X-Saas-Timestamp"]}\n${headers["X-Saas-Nonce"]}\n${createHash("sha256").update(seen[0].body).digest("hex")}`;
    expect(headers["X-Saas-Signature"]).toBe(`sha256=${createHmac("sha256", "test-only-secret").update(canonical).digest("hex")}`);
    expect(seen[1].headers["X-Saas-Nonce"]).not.toBe(headers["X-Saas-Nonce"]);
  });
  it("keeps large decimal strings exact and rejects malformed responses", () => {
    expect(parseInventoryPage(JSON.stringify(page([hubEvent]))).events[0].hub_event_id).toBe("9007199254740993");
    expect(parseInventoryPage(JSON.stringify(page([hubEvent]))).events[0].amount_minor).toBe("1000000000000000");
    expect(() => parseInventoryPage(JSON.stringify(page([{ ...hubEvent, hub_event_id: 9007199254740993 } as unknown as InventoryEvent])))).toThrow();
    expect(() => parseInventoryPage(JSON.stringify(page([{ ...hubEvent, amount_minor: 1 } as unknown as InventoryEvent])))).toThrow();
    expect(() => parseInventoryPage(JSON.stringify(page([], true)))).toThrow();
    expect(() => parseInventoryPage(JSON.stringify(page([], false, "cursor")))).toThrow();
    expect(() => parseInventoryPage('{"events":[],"events":[],"has_more":false,"next_cursor":null,"scan_upper_hub_event_id":"0","scan_started_at":"2026-10-18T11:00:00.000000Z","source_activated_at":"2026-10-17T00:00:00.000000Z"}')).toThrow();
  });
  it.each([401, 403, 422, 429, 503, 302])("handles HTTP %i without exposing response data", async status => {
    const client = createInventoryClient({ endpoint: env.DRVO_SAAS_FINANCIAL_ENDPOINT,
      keyId: "key1", secret: "test-only-secret" },
    async () => ({ status, body: "private response", headers: {} }));
    await expect(client({})).rejects.toThrow(/^INVENTORY_/);
  });
});

describe("independent three-way comparison", () => {
  const compare = (a: Approval[] = [approval], o: Outbox[] = [outbox], h: InventoryEvent[] = [],
    fullInventory = true) => compareFinancialEvidence({ approvals: a, outbox: o, hub: h, cutoff, fullInventory })
      .map(f => f.code);
  it("matches exact identities, money and normalized timestamps provisionally", () => {
    expect(compare([approval], [outbox], [{ ...hubEvent, amount_minor: "999999999999" }])).toEqual([]);
  });
  it("distinguishes missing outbox, pending delivery, provisional Hub absence and Hub-only events", () => {
    expect(compare([approval], [])).toContain("APPROVAL_MISSING_OUTBOX");
    expect(compare([approval], [{ ...outbox, state: "PENDING" }])).toContain("DELIVERY_PENDING");
    expect(compare([approval], [{ ...outbox, state: "PENDING" }])).not.toContain("HUB_NOT_OBSERVED_PROVISIONAL");
    expect(compare()).toContain("HUB_NOT_OBSERVED_PROVISIONAL");
    expect(compare([], [], [hubEvent])).toContain("HUB_WITHOUT_ELIGIBLE_APPROVAL");
    expect(compare([approval], [outbox], [], false)).not.toContain("HUB_NOT_OBSERVED_PROVISIONAL");
  });
  it("finds identity, amount, currency, time and local payload conflicts", () => {
    const badHub = { ...hubEvent, source_payment_id: "wrong", amount_minor: "2", currency: "USD" as const,
      occurred_at: "2026-10-18T10:00:01.123000Z" };
    const codes = compare([approval], [{ ...outbox, amountMinor: "2" }], [badHub]);
    for (const code of ["OUTBOX_PAYLOAD_CONFLICT", "OUTBOX_AMOUNT_MISMATCH", "HUB_IDENTITY_MISMATCH",
      "HUB_AMOUNT_MISMATCH", "HUB_CURRENCY_MISMATCH", "HUB_TIME_MISMATCH"]) expect(codes).toContain(code);
  });
  it("detects conflicting event IDs for the same payment identity", () => {
    const codes = compare([approval], [{ ...outbox, eventId: "other-event" }],
      [{ ...hubEvent, event_id: "hub-other-event" }]);
    expect(codes).toContain("OUTBOX_EVENT_ID_CONFLICT");
    expect(codes).toContain("HUB_EVENT_ID_CONFLICT");
  });
  it("compares equivalent occurrence instants exactly", () => {
    const equivalent = { ...hubEvent, amount_minor: "999999999999",
      occurred_at: "2026-10-18T12:00:00.123000+02:00" };
    expect(compare([approval], [outbox], [equivalent])).not.toContain("HUB_TIME_MISMATCH");
  });
  it("excludes approved payments before cutoff", () => {
    const old = { ...approval, reviewedAtText: "2026-10-16T23:59:59.0000000" };
    expect(compare([old], [])).not.toContain("APPROVAL_MISSING_OUTBOX");
  });
});

describe("bounded reconciliation runner", () => {
  it("exits disabled without opening storage or network", async () => {
    const deps = baseDeps();
    expect(await runFinancialReconciliation({}, deps)).toEqual({ status: "NOT_RECONCILED" });
    expect(deps.begin).not.toHaveBeenCalled();
  });
  it("follows an empty intermediate page and completes provisionally", async () => {
    const deps = baseDeps();
    deps.fetch = vi.fn().mockResolvedValueOnce(page([], true, "cursor-one"))
      .mockResolvedValueOnce(page([], false));
    const result = await runFinancialReconciliation(env, deps);
    expect(result.status).toBe("OBSERVED_MATCHES_PROVISIONAL");
    expect(deps.fetch).toHaveBeenCalledTimes(2);
    expect(deps.fetch.mock.calls[1][0].cursor).toBe("cursor-one");
    expect(deps.record).toHaveBeenCalledTimes(2);
    expect(deps.finish).toHaveBeenCalledTimes(1);
  });
  it("marks repeated cursors, network errors and rate limits incomplete", async () => {
    for (const failingFetch of [
      vi.fn().mockResolvedValueOnce(page([], true, "same")).mockResolvedValueOnce(page([], true, "same")),
      vi.fn().mockRejectedValue(new Error("INVENTORY_NETWORK_ERROR")),
      vi.fn().mockRejectedValue(new Error("INVENTORY_RATE_LIMITED")),
    ]) {
      const deps = { ...baseDeps(), fetch: failingFetch };
      expect((await runFinancialReconciliation(env, deps)).status).toBe("SCAN_INCOMPLETE");
      expect(deps.finish).not.toHaveBeenCalled();
      expect(deps.state).toHaveBeenCalledWith(expect.anything(), "SCAN_INCOMPLETE", expect.any(String));
    }
  });
  it("pauses bounded work and never labels a partial traversal clean", async () => {
    const deps = baseDeps();
    let n = 0;
    deps.fetch.mockImplementation(async () => page([], true, `cursor-${++n}`));
    const result = await runFinancialReconciliation(env, deps);
    expect(result.status).toBe("SCAN_INCOMPLETE");
    expect(deps.fetch).toHaveBeenCalledTimes(15);
    expect(deps.state).toHaveBeenCalledWith(expect.anything(), "PAUSED");
    expect(deps.finish).not.toHaveBeenCalled();
  });
  it("rejects a changed Hub activation boundary", async () => {
    const deps = baseDeps();
    deps.fetch.mockResolvedValue({ ...page([]), source_activated_at: "2026-10-16T00:00:00.000000Z" });
    expect((await runFinancialReconciliation(env, deps)).status).toBe("SCAN_INCOMPLETE");
    expect(deps.state).toHaveBeenCalledWith(expect.anything(), "SCAN_INCOMPLETE", "SOURCE_ACTIVATION_CHANGED");
  });
  it("finalizes persisted terminal traversal after an interrupted process", async () => {
    const deps = baseDeps();
    deps.begin.mockResolvedValue({ ...scanRun, PagesRead: 2, TraversalComplete: true });
    deps.fetch = vi.fn();
    expect((await runFinancialReconciliation(env, deps)).status).toBe("OBSERVED_MATCHES_PROVISIONAL");
    expect(deps.fetch).not.toHaveBeenCalled();
  });
  it("fresh later scans can observe a late-visible accepted event", async () => {
    const first = baseDeps();
    first.local.mockResolvedValue({ approvals: [approval], outbox: [outbox] });
    first.fetch.mockResolvedValue(page([]));
    expect((await runFinancialReconciliation(env, first)).status).toBe("DISCREPANCIES_OBSERVED");
    expect(first.finish.mock.calls[0][1]).toContainEqual(
      { subject: eventId, code: "HUB_NOT_OBSERVED_PROVISIONAL" });
    const second = baseDeps();
    second.local.mockResolvedValue({ approvals: [approval], outbox: [outbox] });
    second.observed.mockResolvedValue([{ ...hubEvent, amount_minor: "999999999999" }]);
    second.fetch.mockResolvedValue(page([{ ...hubEvent, amount_minor: "999999999999" }]));
    expect((await runFinancialReconciliation(env, second)).status).toBe("OBSERVED_MATCHES_PROVISIONAL");
  });
  it("sends overlapping accepted-at windows unchanged through cursor pages", async () => {
    const deps = baseDeps();
    deps.fetch.mockResolvedValueOnce(page([], true, "cursor-1")).mockResolvedValueOnce(page([]));
    const windowEnv = { ...env,
      DRVO_SAAS_FINANCIAL_RECONCILIATION_ACCEPTED_FROM: "2026-10-17T00:00:00Z",
      DRVO_SAAS_FINANCIAL_RECONCILIATION_ACCEPTED_BEFORE: "2026-10-19T00:00:00Z" };
    deps.begin.mockResolvedValue({ ...scanRun,
      AcceptedFromText: "2026-10-17T00:00:00.000000",
      AcceptedBeforeText: "2026-10-19T00:00:00.000000" });
    await runFinancialReconciliation(windowEnv, deps);
    expect(deps.fetch.mock.calls[0][0]).toMatchObject({
      accepted_from: "2026-10-17T00:00:00.000000Z",
      accepted_before: "2026-10-19T00:00:00.000000Z",
    });
    expect(deps.fetch.mock.calls[1][0]).toMatchObject({
      accepted_from: "2026-10-17T00:00:00.000000Z",
      cursor: "cursor-1",
    });
  });
  it("does not log credentials or raw payload on failure", async () => {
    const deps = { ...baseDeps(), fetch: vi.fn().mockRejectedValue(new Error("test-only-secret private body")) };
    await runFinancialReconciliation(env, deps);
    const logs = JSON.stringify(silent.warn.mock.calls);
    expect(logs).not.toContain("test-only-secret");
    expect(logs).not.toContain("private body");
  });
});
