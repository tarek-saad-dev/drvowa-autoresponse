import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closePool, query, sql } from "@/lib/db";
import { beginScan, finishScan, loadObservedHub, recordPage, setScanState }
  from "@/modules/billing/saas-financial-reconciliation-repository";
import type { InventoryEvent } from "@/modules/billing/saas-financial-reconciliation-client";

// Run only against an operator-verified disposable SQL Server with migrations 029–031 applied.
const isolated = process.env.DRVO_TEST_ISOLATED_DB === "1"
  && /(?:test|isolated)/i.test(process.env.DB_NAME ?? "");
describe.runIf(isolated)("reconciliation evidence on verified isolated SQL Server", () => {
  beforeAll(async () => {
    const hardening = await query<{ Version: string }>(
      "SELECT Version FROM dbo.TblSchemaMigration WHERE Version = N'031'");
    if (!hardening.recordset.length) throw new Error("Apply migration 031 to the isolated test DB first");
  });
  afterAll(async () => { await closePool(); });
  it("persists a source-scoped observation and preserves an open investigation across fresh scans", async () => {
    const names = await query<{ Name: string }>(
      `SELECT name AS Name FROM sys.tables WHERE name IN
       (N'TblSaasFinancialReconciliationRun',N'TblSaasFinancialReconciliationEvent',
        N'TblSaasFinancialReconciliationObservation',N'TblSaasFinancialReconciliationCase',
        N'TblSaasFinancialReconciliationFinding')`);
    expect(names.recordset).toHaveLength(5);
    const source = `TEST_${randomUUID()}`;
    const activation = "2026-10-17T00:00:00.000000Z";
    const event: InventoryEvent = {
      hub_event_id: "9007199254740993", event_id: `event:${randomUUID()}`,
      type: "payment.confirmed", source_payment_id: `payment:${randomUUID()}`,
      source_refund_id: null, original_source_payment_id: null, amount_minor: "1000000000000000",
      currency: "EGP", occurred_at: "2026-10-18T10:00:00.000000Z",
      accepted_at: "2026-10-18T10:01:00.000000Z",
    };
    const fractionalEvent: InventoryEvent = { ...event,
      hub_event_id: "9007199254740994", event_id: `event:${randomUUID()}`,
      source_payment_id: `payment:${randomUUID()}`, amount_minor: "1", currency: "USD",
      occurred_at: "2026-10-18T10:00:00.123456Z",
      accepted_at: "2026-10-18T10:01:00.654321Z",
    };
    const first = await beginScan(source, activation, activation, null, 20);
    await recordPage(first, { events: [event, fractionalEvent], has_more: false, next_cursor: null,
      scan_upper_hub_event_id: fractionalEvent.hub_event_id,
      scan_started_at: "2026-10-18T11:00:00.000000Z", source_activated_at: activation });
    const observed = await loadObservedHub(first);
    expect(observed).toHaveLength(2);
    expect(observed).toEqual(expect.arrayContaining([event, fractionalEvent]));
    await finishScan(first, [{ subject: event.event_id, code: "HUB_WITHOUT_ELIGIBLE_APPROVAL" }]);
    const second = await beginScan(source, activation, activation, null, 20);
    expect(second.RunID).not.toBe(first.RunID);
    await recordPage(second, { events: [event, fractionalEvent], has_more: false, next_cursor: null,
      scan_upper_hub_event_id: fractionalEvent.hub_event_id,
      scan_started_at: "2026-10-18T11:05:00.000000Z", source_activated_at: activation });
    await finishScan(second, []);
    const cases = await query<{ InvestigationState: string; ObservationCount: number }>(
      `SELECT InvestigationState,ObservationCount FROM dbo.TblSaasFinancialReconciliationCase
       WHERE SourceKey=@source`, [{ name: "source", type: sql.NVarChar(100), value: source }]);
    expect(cases.recordset).toEqual([expect.objectContaining({
      InvestigationState: "OPEN", ObservationCount: 1,
    })]);
    const conflicting = await beginScan(source, activation, activation, null, 20);
    await expect(recordPage(conflicting, { events: [{ ...fractionalEvent,
      occurred_at: "2026-10-18T10:00:00.123457Z" }], has_more: false, next_cursor: null,
      scan_upper_hub_event_id: fractionalEvent.hub_event_id,
      scan_started_at: "2026-10-18T11:10:00.000000Z", source_activated_at: activation }))
      .rejects.toThrow("HUB_FACT_CONFLICT");
    await setScanState(conflicting, "SCAN_INCOMPLETE", "HUB_FACT_CONFLICT");
    const paused = await beginScan(source, activation, activation, null, 20);
    await setScanState(paused, "PAUSED");
    const resumed = await beginScan(source, activation, activation, null, 20);
    expect(resumed.RunID).toBe(paused.RunID);
    await setScanState(resumed, "SCAN_INCOMPLETE", "TEST_STOP");
  });

  it("enforces source-matched observation foreign keys under differently cased source keys", async () => {
    const source = `RECON_CASE_${randomUUID().slice(0, 12)}`;
    const lower = source.toLowerCase();
    const upper = source.toUpperCase();
    const activation = "2026-10-17T00:00:00.000000Z";
    const lowerRun = await beginScan(lower, activation, activation, null, 20);
    const upperRun = await beginScan(upper, activation, activation, null, 20);
    expect(lowerRun.RunID).not.toBe(upperRun.RunID);

    const eventId = `event:${randomUUID()}`;
    await query(`INSERT dbo.TblSaasFinancialReconciliationEvent
      (SourceKey,EventID,HubEventID,EventType,SourcePaymentID,AmountMinor,
       CurrencyCode,OccurredAtUtc,AcceptedAtUtc)
      VALUES (@source,@event,N'1',N'payment.confirmed',N'payment:test',N'100',
       N'EGP',SYSUTCDATETIME(),SYSUTCDATETIME())`, [
      { name: "source", type: sql.NVarChar(100), value: lower },
      { name: "event", type: sql.NVarChar(150), value: eventId },
    ]);
    const eventInput = [{ name: "source", type: sql.NVarChar(100), value: lower },
      { name: "event", type: sql.NVarChar(150), value: eventId }];
    await expect(query(`DELETE FROM dbo.TblSaasFinancialReconciliationEvent
      WHERE SourceKey=@source AND EventID=@event`, eventInput)).rejects.toThrow();
    await expect(query("DELETE FROM dbo.TblSaasFinancialReconciliationRun WHERE RunID=@run", [
      { name: "run", type: sql.UniqueIdentifier, value: upperRun.RunID },
    ])).rejects.toThrow();

    const observation = (runId: string, sourceKey: string, observedEventId = eventId) => query(
      `INSERT dbo.TblSaasFinancialReconciliationObservation(RunID,SourceKey,EventID)
       VALUES (@run,@source,@event)`, [
        { name: "run", type: sql.UniqueIdentifier, value: runId },
        { name: "source", type: sql.NVarChar(100), value: sourceKey },
        { name: "event", type: sql.NVarChar(150), value: observedEventId },
      ]);
    await expect(observation(upperRun.RunID, lower)).rejects.toThrow();
    await expect(observation(lowerRun.RunID, upper)).rejects.toThrow();
    await expect(observation(lowerRun.RunID, lower, `missing:${randomUUID()}`)).rejects.toThrow();
    await expect(observation(randomUUID(), lower)).rejects.toThrow();
    await observation(lowerRun.RunID, lower);
    await expect(observation(lowerRun.RunID, lower)).rejects.toThrow();
    const stored = await query<{ SourceKey: string }>(
      "SELECT SourceKey FROM dbo.TblSaasFinancialReconciliationObservation WHERE RunID=@run",
      [{ name: "run", type: sql.UniqueIdentifier, value: lowerRun.RunID }]);
    expect(stored.recordset).toEqual([{ SourceKey: lower }]);
    await expect(query(`DELETE FROM dbo.TblSaasFinancialReconciliationObservation
      WHERE RunID=@run AND EventID=@event`, [
      { name: "run", type: sql.UniqueIdentifier, value: lowerRun.RunID },
      { name: "event", type: sql.NVarChar(150), value: eventId },
    ])).rejects.toThrow();

    const caseId = randomUUID();
    await query(`INSERT dbo.TblSaasFinancialReconciliationCase
      (CaseID,SourceKey,SubjectKey,Code) VALUES (@case,@source,@subject,N'TEST_FINDING')`, [
      { name: "case", type: sql.UniqueIdentifier, value: caseId },
      { name: "source", type: sql.NVarChar(100), value: lower },
      { name: "subject", type: sql.NVarChar(150), value: eventId },
    ]);
    await expect(query("DELETE FROM dbo.TblSaasFinancialReconciliationCase WHERE CaseID=@case", [
      { name: "case", type: sql.UniqueIdentifier, value: caseId },
    ])).rejects.toThrow();
    const finding = (runId: string, sourceKey: string) => query(
      `INSERT dbo.TblSaasFinancialReconciliationFinding(RunID,CaseID,SourceKey)
       VALUES (@run,@case,@source)`, [
        { name: "run", type: sql.UniqueIdentifier, value: runId },
        { name: "case", type: sql.UniqueIdentifier, value: caseId },
        { name: "source", type: sql.NVarChar(100), value: sourceKey },
      ]);
    await expect(finding(upperRun.RunID, lower)).rejects.toThrow();
    await expect(finding(lowerRun.RunID, upper)).rejects.toThrow();
    await finding(lowerRun.RunID, lower);
    await expect(query(`DELETE FROM dbo.TblSaasFinancialReconciliationFinding
      WHERE RunID=@run AND CaseID=@case`, [
      { name: "run", type: sql.UniqueIdentifier, value: lowerRun.RunID },
      { name: "case", type: sql.UniqueIdentifier, value: caseId },
    ])).rejects.toThrow();
  });
});
