import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { closePool, query, sql } from "@/lib/db";
import { beginScan, finishScan, loadObservedHub, recordPage, setScanState }
  from "@/modules/billing/saas-financial-reconciliation-repository";
import type { InventoryEvent } from "@/modules/billing/saas-financial-reconciliation-client";

// Run only against an operator-verified disposable SQL Server with migrations 029 and 030 already applied.
const isolated = process.env.DRVO_TEST_ISOLATED_DB === "1"
  && /(?:test|isolated)/i.test(process.env.DB_NAME ?? "");
describe.runIf(isolated)("reconciliation evidence on verified isolated SQL Server", () => {
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
    const first = await beginScan(source, activation, activation, null, 20);
    await recordPage(first, { events: [event], has_more: false, next_cursor: null,
      scan_upper_hub_event_id: event.hub_event_id,
      scan_started_at: "2026-10-18T11:00:00.000000Z", source_activated_at: activation });
    expect((await loadObservedHub(first))[0]).toMatchObject(event);
    await finishScan(first, [{ subject: event.event_id, code: "HUB_WITHOUT_ELIGIBLE_APPROVAL" }]);
    const second = await beginScan(source, activation, activation, null, 20);
    expect(second.RunID).not.toBe(first.RunID);
    await recordPage(second, { events: [event], has_more: false, next_cursor: null,
      scan_upper_hub_event_id: event.hub_event_id,
      scan_started_at: "2026-10-18T11:05:00.000000Z", source_activated_at: activation });
    await finishScan(second, []);
    const cases = await query<{ InvestigationState: string; ObservationCount: number }>(
      `SELECT InvestigationState,ObservationCount FROM dbo.TblSaasFinancialReconciliationCase
       WHERE SourceKey=@source`, [{ name: "source", type: sql.NVarChar(100), value: source }]);
    expect(cases.recordset).toEqual([expect.objectContaining({
      InvestigationState: "OPEN", ObservationCount: 1,
    })]);
    const paused = await beginScan(source, activation, activation, null, 20);
    await setScanState(paused, "PAUSED");
    const resumed = await beginScan(source, activation, activation, null, 20);
    expect(resumed.RunID).toBe(paused.RunID);
    await setScanState(resumed, "SCAN_INCOMPLETE", "TEST_STOP");
  });
});
