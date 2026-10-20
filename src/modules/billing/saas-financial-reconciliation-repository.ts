import { randomUUID } from "node:crypto";
import { query, sql, withTransaction, type QueryInput } from "@/lib/db";
import type { InventoryEvent, InventoryPage, InventoryWindow } from "./saas-financial-reconciliation-client";
import type { Approval, Finding, Outbox, Refund } from "./saas-financial-reconciliation-compare";

export type ScanRun = {
  RunID: string; SourceKey: string; Status: string; PagesRead: number; EventsRead: number; TraversalComplete: boolean;
  NextCursor: string | null; ScanUpperHubEventID: string | null; HubScanStartedAtText: string | null;
  AcceptedFromText: string | null; AcceptedBeforeText: string | null; StartedAtUtc: Date; UpdatedAtUtc: Date;
  SourceActivatedText: string; CaptureCutoffText: string;
};
const runSelect = `SELECT RunID, SourceKey, Status, PagesRead, EventsRead, NextCursor,
  TraversalComplete, ScanUpperHubEventID, CONVERT(varchar(33), HubScanStartedAtUtc, 126) AS HubScanStartedAtText,
  CONVERT(varchar(33), AcceptedFromUtc, 126) AS AcceptedFromText,
  CONVERT(varchar(33), AcceptedBeforeUtc, 126) AS AcceptedBeforeText, StartedAtUtc, UpdatedAtUtc
  ,CONVERT(varchar(33), SourceActivatedAtUtc, 126) AS SourceActivatedText
  ,CONVERT(varchar(33), CaptureCutoffAtUtc, 126) AS CaptureCutoffText
  FROM dbo.TblSaasFinancialReconciliationRun`;
const sourceInput = (source: string): QueryInput => ({ name: "source", type: sql.NVarChar(100), value: source });
const runInput = (run: string): QueryInput => ({ name: "run", type: sql.UniqueIdentifier, value: run });

export async function beginScan(source: string, activated: string, cutoff: string,
  window: InventoryWindow | null, pageLimit: number): Promise<ScanRun> {
  return withTransaction(async trx => {
    const open = (await trx.query<ScanRun>(`${runSelect} WITH (UPDLOCK, HOLDLOCK)
      WHERE SourceKey = @source AND Status IN (N'SCANNING', N'PAUSED')`, [sourceInput(source)])).recordset[0];
    if (open) {
      if (open.SourceActivatedText + "Z" !== activated || open.CaptureCutoffText + "Z" !== cutoff)
        throw new Error("RECONCILIATION_BOUNDARY_CHANGED");
      if (open.Status === "SCANNING" && Date.now() - open.UpdatedAtUtc.getTime() < 600_000)
        throw new Error("RECONCILIATION_ALREADY_RUNNING");
      if (Date.now() - open.StartedAtUtc.getTime() > 86_400_000) {
        await trx.execute(`UPDATE dbo.TblSaasFinancialReconciliationRun SET Status=N'SCAN_INCOMPLETE',
          CompletedAtUtc=SYSUTCDATETIME(), UpdatedAtUtc=SYSUTCDATETIME(), ErrorCode=N'SCAN_EXPIRED'
          WHERE RunID=@run`, [runInput(open.RunID)]);
      } else {
        await trx.execute(`UPDATE dbo.TblSaasFinancialReconciliationRun SET Status=N'SCANNING',
          UpdatedAtUtc=SYSUTCDATETIME() WHERE RunID=@run`, [runInput(open.RunID)]);
        return { ...open, Status: "SCANNING" };
      }
    }
    const id = randomUUID();
    await trx.execute(`INSERT dbo.TblSaasFinancialReconciliationRun
      (RunID,SourceKey,Status,AcceptedFromUtc,AcceptedBeforeUtc,SourceActivatedAtUtc,CaptureCutoffAtUtc,PageLimit)
      VALUES (@run,@source,N'SCANNING',CONVERT(datetime2(6),@from,126),CONVERT(datetime2(6),@before,126),
        CONVERT(datetime2(6),@activated,126),CONVERT(datetime2(6),@cutoff,126),@limit)`, [
      runInput(id), sourceInput(source),
      { name: "from", type: sql.VarChar(33), value: window?.accepted_from.slice(0,-1) ?? null },
      { name: "before", type: sql.VarChar(33), value: window?.accepted_before.slice(0,-1) ?? null },
      { name: "activated", type: sql.VarChar(33), value: activated.slice(0,-1) },
      { name: "cutoff", type: sql.VarChar(33), value: cutoff.slice(0,-1) },
      { name: "limit", type: sql.Int, value: pageLimit },
    ]);
    return (await trx.query<ScanRun>(`${runSelect} WHERE RunID=@run`, [runInput(id)])).recordset[0];
  });
}

export async function recordPage(run: ScanRun, page: InventoryPage): Promise<void> {
  await withTransaction(async trx => {
    for (const e of page.events) {
      const inputs: QueryInput[] = [
        sourceInput(run.SourceKey),
        { name: "event", type: sql.NVarChar(150), value: e.event_id },
      ];
      const prior = (await trx.query<{ HubEventID: string; EventType: string; SourcePaymentID: string | null;
        SourceRefundID: string | null; OriginalSourcePaymentID: string | null; AmountMinor: string;
        CurrencyCode: string; OccurredText: string; AcceptedText: string }>(
        `SELECT HubEventID, EventType, SourcePaymentID, SourceRefundID, OriginalSourcePaymentID,
         AmountMinor, CurrencyCode, CONVERT(varchar(33),OccurredAtUtc,126) AS OccurredText,
         CONVERT(varchar(33),AcceptedAtUtc,126) AS AcceptedText
         FROM dbo.TblSaasFinancialReconciliationEvent WITH (UPDLOCK,HOLDLOCK)
         WHERE SourceKey=@source AND EventID=@event`, inputs)).recordset[0];
      if (prior) {
        if (prior.HubEventID !== e.hub_event_id || prior.EventType !== e.type
          || prior.SourcePaymentID !== e.source_payment_id || prior.SourceRefundID !== e.source_refund_id
          || prior.OriginalSourcePaymentID !== e.original_source_payment_id
          || prior.AmountMinor !== e.amount_minor || prior.CurrencyCode !== e.currency
          || prior.OccurredText !== e.occurred_at.slice(0,-1)
          || prior.AcceptedText !== e.accepted_at.slice(0,-1)) throw new Error("HUB_FACT_CONFLICT");
        await trx.execute(`UPDATE dbo.TblSaasFinancialReconciliationEvent
          SET LastObservedAtUtc=SYSUTCDATETIME(),ObservationCount=ObservationCount+1
          WHERE SourceKey=@source AND EventID=@event`, inputs);
      } else {
        await trx.execute(`INSERT dbo.TblSaasFinancialReconciliationEvent
          (SourceKey,EventID,HubEventID,EventType,SourcePaymentID,SourceRefundID,OriginalSourcePaymentID,
           AmountMinor,CurrencyCode,OccurredAtUtc,AcceptedAtUtc)
          VALUES (@source,@event,@hubId,@type,@payment,@refund,@original,@amount,@currency,
            CONVERT(datetime2(6),@occurred,126),CONVERT(datetime2(6),@accepted,126))`, [
          ...inputs, { name: "hubId", type: sql.VarChar(20), value: e.hub_event_id },
          { name: "type", type: sql.NVarChar(32), value: e.type },
          { name: "payment", type: sql.NVarChar(150), value: e.source_payment_id },
          { name: "refund", type: sql.NVarChar(150), value: e.source_refund_id },
          { name: "original", type: sql.NVarChar(150), value: e.original_source_payment_id },
          { name: "amount", type: sql.VarChar(20), value: e.amount_minor },
          { name: "currency", type: sql.NVarChar(3), value: e.currency },
          { name: "occurred", type: sql.VarChar(33), value: e.occurred_at.slice(0,-1) },
          { name: "accepted", type: sql.VarChar(33), value: e.accepted_at.slice(0,-1) },
        ]);
      }
      await trx.execute(`INSERT dbo.TblSaasFinancialReconciliationObservation(RunID,SourceKey,EventID)
        VALUES (@run,@source,@event)`, [runInput(run.RunID), ...inputs]);
    }
    const affected = await trx.execute(`UPDATE dbo.TblSaasFinancialReconciliationRun SET
       PagesRead=PagesRead+1, EventsRead=EventsRead+@count, NextCursor=@cursor,
       TraversalComplete=@complete,
       ScanUpperHubEventID=@upper,
       HubScanStartedAtUtc=CONVERT(datetime2(6),@scanStarted,126), UpdatedAtUtc=SYSUTCDATETIME()
       WHERE RunID=@run AND Status=N'SCANNING'`, [
      runInput(run.RunID), { name: "count", type: sql.Int, value: page.events.length },
      { name: "cursor", type: sql.NVarChar(2048), value: page.next_cursor },
      { name: "complete", type: sql.Bit, value: !page.has_more },
      { name: "upper", type: sql.VarChar(20), value: page.scan_upper_hub_event_id },
      { name: "scanStarted", type: sql.VarChar(33), value: page.scan_started_at.slice(0,-1) },
    ]);
    if (affected !== 1) throw new Error("SCAN_RUN_LOST");
  });
}

export async function loadLocalEvidence(source: string, cutoff: string, cap = 5000):
  Promise<{ approvals: Approval[]; refunds: Refund[]; outbox: Outbox[] }> {
  const approvalResult = await query<{
    PaymentRequestID: string; PaymentMethod: string; AmountText: string; CurrencyCode: string;
    ReviewedAtText: string; ReviewedByUserID: string | null; ApprovedSubscriptionID: string | null;
  }>(`SELECT TOP (${cap + 1}) PaymentRequestID,PaymentMethod,CONVERT(varchar(32),Amount) AS AmountText,
      CurrencyCode,CONVERT(varchar(27),ReviewedAtUtc,126) AS ReviewedAtText,
      ReviewedByUserID,ApprovedSubscriptionID
      FROM dbo.TblManualPaymentRequest
      WHERE Status=N'APPROVED' AND ReviewedAtUtc IS NOT NULL AND PaymentMethod=N'INSTAPAY'
        AND ReviewedAtUtc >= CONVERT(datetime2(6),@cutoff,126)
      ORDER BY ReviewedAtUtc,PaymentRequestID`, [{ name: "cutoff", type: sql.VarChar(33), value: cutoff.slice(0,-1) }]);
  const outboxResult = await query<{
    EventID: string; SourcePaymentID: string; SourceRefundID: string | null; RefundID: string | null;
    EventType: string; PaymentRequestID: string; AmountMinor: string;
    CurrencyCode: string; OccurredAtText: string; Payload: string; DeliveryState: string;
  }>(`SELECT TOP (${cap + 1}) EventID,SourcePaymentID,SourceRefundID,RefundID,EventType,PaymentRequestID,
      CONVERT(varchar(20),AmountMinor) AS AmountMinor,CurrencyCode,
      CONVERT(varchar(23),OccurredAtUtc,126)+'000Z' AS OccurredAtText,Payload,DeliveryState
      FROM dbo.TblSaasFinancialOutbox
      WHERE SourceKey COLLATE Latin1_General_100_BIN2 = @source COLLATE Latin1_General_100_BIN2
      ORDER BY CreatedAtUtc,EventID`,
    [sourceInput(source)]);
  const refundResult = await query<{ RefundID: string; PaymentRequestID: string; AmountMinor: string;
    CurrencyCode: string; CompletedAtText: string; State: string }>(
    `SELECT TOP (${cap + 1}) r.RefundID,r.PaymentRequestID,
      CONVERT(varchar(20),r.AmountMinor) AS AmountMinor,r.CurrencyCode,
      CONVERT(varchar(23),r.CompletedAtUtc,126) AS CompletedAtText,r.State
      FROM dbo.TblBillingRefund r
      WHERE r.State=N'SUCCEEDED' AND r.CompletedAtUtc >= CONVERT(datetime2(6),@cutoff,126)
      ORDER BY r.CompletedAtUtc,r.RefundID`,
    [{ name: "cutoff", type: sql.VarChar(33), value: cutoff.slice(0,-1) }]);
  if (approvalResult.recordset.length > cap || outboxResult.recordset.length > cap
    || refundResult.recordset.length > cap)
    throw new Error("LOCAL_EVIDENCE_LIMIT");
  return {
    refunds: refundResult.recordset.map(r => ({ refundId: r.RefundID, paymentRequestId: r.PaymentRequestID,
      amountMinor: r.AmountMinor, currency: r.CurrencyCode, completedAtText: r.CompletedAtText, state: r.State })),
    approvals: approvalResult.recordset.map(r => ({
      paymentRequestId: r.PaymentRequestID, method: r.PaymentMethod, amountText: r.AmountText,
      currency: r.CurrencyCode, reviewedAtText: r.ReviewedAtText,
      reviewedByUserId: r.ReviewedByUserID, approvedSubscriptionId: r.ApprovedSubscriptionID,
    })),
    outbox: outboxResult.recordset.map(r => ({
      eventId: r.EventID, sourcePaymentId: r.SourcePaymentID, paymentRequestId: r.PaymentRequestID,
      amountMinor: r.AmountMinor, currency: r.CurrencyCode, occurredAtText: r.OccurredAtText,
      payload: r.Payload, state: r.DeliveryState,
      eventType: r.EventType, refundId: r.RefundID, sourceRefundId: r.SourceRefundID,
    })),
  };
}

export async function loadObservedHub(run: ScanRun): Promise<InventoryEvent[]> {
  const result = await query<{
    HubEventID: string; EventID: string; EventType: InventoryEvent["type"]; SourcePaymentID: string | null;
    SourceRefundID: string | null; OriginalSourcePaymentID: string | null; AmountMinor: string;
    CurrencyCode: InventoryEvent["currency"]; OccurredText: string; AcceptedText: string;
  }>(`SELECT e.HubEventID,e.EventID,e.EventType,e.SourcePaymentID,e.SourceRefundID,
    e.OriginalSourcePaymentID,e.AmountMinor,e.CurrencyCode,
    CONVERT(varchar(33),e.OccurredAtUtc,126)+'Z' AS OccurredText,
    CONVERT(varchar(33),e.AcceptedAtUtc,126)+'Z' AS AcceptedText
    FROM dbo.TblSaasFinancialReconciliationObservation o
    JOIN dbo.TblSaasFinancialReconciliationEvent e ON e.SourceKey=o.SourceKey AND e.EventID=o.EventID
    WHERE o.RunID=@run`, [runInput(run.RunID)]);
  return result.recordset.map(r => ({
    hub_event_id: r.HubEventID, event_id: r.EventID, type: r.EventType,
    source_payment_id: r.SourcePaymentID, source_refund_id: r.SourceRefundID,
    original_source_payment_id: r.OriginalSourcePaymentID, amount_minor: r.AmountMinor,
    currency: r.CurrencyCode, occurred_at: r.OccurredText, accepted_at: r.AcceptedText,
  }));
}

export async function finishScan(run: ScanRun, findings: Finding[]): Promise<void> {
  await withTransaction(async trx => {
    for (const finding of findings) {
      const inputs: QueryInput[] = [sourceInput(run.SourceKey),
        { name: "subject", type: sql.NVarChar(150), value: finding.subject },
        { name: "code", type: sql.NVarChar(64), value: finding.code }];
      const prior = (await trx.query<{ CaseID: string }>(
        `SELECT CaseID FROM dbo.TblSaasFinancialReconciliationCase WITH (UPDLOCK,HOLDLOCK)
         WHERE SourceKey=@source AND SubjectKey=@subject AND Code=@code`, inputs)).recordset[0];
      const id = prior?.CaseID ?? randomUUID();
      if (prior) await trx.execute(`UPDATE dbo.TblSaasFinancialReconciliationCase
        SET LastObservedAtUtc=SYSUTCDATETIME(),ObservationCount=ObservationCount+1
        WHERE CaseID=@case`, [{ name: "case", type: sql.UniqueIdentifier, value: id }]);
      else await trx.execute(`INSERT dbo.TblSaasFinancialReconciliationCase
        (CaseID,SourceKey,SubjectKey,Code) VALUES (@case,@source,@subject,@code)`,
        [{ name: "case", type: sql.UniqueIdentifier, value: id }, ...inputs]);
      await trx.execute(`INSERT dbo.TblSaasFinancialReconciliationFinding(RunID,CaseID,SourceKey)
        VALUES (@run,@case,@source)`, [runInput(run.RunID),
        { name: "case", type: sql.UniqueIdentifier, value: id }, sourceInput(run.SourceKey)]);
    }
    const affected = await trx.execute(`UPDATE dbo.TblSaasFinancialReconciliationRun
      SET Status=@status,CompletedAtUtc=SYSUTCDATETIME(),UpdatedAtUtc=SYSUTCDATETIME()
      WHERE RunID=@run AND Status=N'SCANNING'`, [
      runInput(run.RunID), { name: "status", type: sql.NVarChar(32),
        value: findings.length ? "DISCREPANCIES_OBSERVED" : "OBSERVED_MATCHES_PROVISIONAL" },
    ]);
    if (affected !== 1) throw new Error("SCAN_RUN_LOST");
  });
}
export async function setScanState(run: ScanRun, status: "PAUSED" | "SCAN_INCOMPLETE", code?: string): Promise<void> {
  await query(`UPDATE dbo.TblSaasFinancialReconciliationRun SET Status=@status,
    UpdatedAtUtc=SYSUTCDATETIME(),CompletedAtUtc=CASE WHEN @status=N'SCAN_INCOMPLETE'
      THEN SYSUTCDATETIME() ELSE NULL END,ErrorCode=@code WHERE RunID=@run AND Status=N'SCANNING'`, [
    runInput(run.RunID), { name: "status", type: sql.NVarChar(32), value: status },
    { name: "code", type: sql.NVarChar(64), value: code ?? null },
  ]);
}
