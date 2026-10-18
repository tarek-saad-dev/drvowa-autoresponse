import { randomUUID } from "node:crypto";
import { execute, query, sql } from "@/lib/db";

export type FinancialClaim = {
  eventId: string;
  sourcePaymentId: string;
  payload: string;
  amountMinor: string;
  currency: string;
  leaseToken: string;
  attemptCount: number;
};

type ClaimRow = {
  EventID: string; SourcePaymentID: string; Payload: string;
  AmountMinor: string; CurrencyCode: string; AttemptCount: number;
};

/** One autocommitted UPDATE claims one due row. OUTPUT INTO is required because migration 029 has an UPDATE trigger. */
export async function claimFinancialEvent(sourceKey: string, leaseSeconds: number): Promise<FinancialClaim | null> {
  const leaseToken = randomUUID();
  const result = await query<ClaimRow>(
    `DECLARE @claimed TABLE (EventID NVARCHAR(150), SourcePaymentID NVARCHAR(150),
      Payload NVARCHAR(2000), AmountMinor VARCHAR(20), CurrencyCode NVARCHAR(3), AttemptCount INT);
     ;WITH due AS (
       SELECT TOP (1) * FROM dbo.TblSaasFinancialOutbox WITH (UPDLOCK, READPAST, ROWLOCK)
       WHERE SourceKey = @sourceKey AND AttemptCount < 2147483647
         AND ((DeliveryState = N'PENDING' AND NextAttemptAtUtc <= SYSUTCDATETIME())
           OR (DeliveryState = N'LEASED' AND LeaseUntilUtc < SYSUTCDATETIME()))
       ORDER BY NextAttemptAtUtc, CreatedAtUtc, EventID
     )
     UPDATE due SET DeliveryState = N'LEASED', LeaseOwner = @leaseToken,
       LeaseUntilUtc = DATEADD(second, @leaseSeconds, SYSUTCDATETIME()),
       AttemptCount = AttemptCount + 1
     OUTPUT INSERTED.EventID, INSERTED.SourcePaymentID, INSERTED.Payload,
       CONVERT(VARCHAR(20), INSERTED.AmountMinor), INSERTED.CurrencyCode, INSERTED.AttemptCount
       INTO @claimed;
     SELECT * FROM @claimed;`,
    [
      { name: "sourceKey", type: sql.NVarChar(100), value: sourceKey },
      { name: "leaseToken", type: sql.NVarChar(128), value: leaseToken },
      { name: "leaseSeconds", type: sql.Int, value: leaseSeconds },
    ],
  );
  const row = result.recordset[0];
  return row ? {
    eventId: row.EventID, sourcePaymentId: row.SourcePaymentID, payload: row.Payload,
    amountMinor: row.AmountMinor, currency: row.CurrencyCode,
    leaseToken, attemptCount: row.AttemptCount,
  } : null;
}

type Settlement = { state: "ACCEPTED" | "PENDING" | "DEAD"; errorCode: string | null; delayMs?: number };

/** An expired or replaced lease cannot acknowledge, retry, or reject an event. */
export async function settleFinancialEvent(claim: FinancialClaim, settlement: Settlement): Promise<boolean> {
  const affected = await execute(
    `UPDATE dbo.TblSaasFinancialOutbox SET
       DeliveryState = @state, LeaseOwner = NULL, LeaseUntilUtc = NULL,
       LastErrorCode = @errorCode,
       AcceptedAtUtc = CASE WHEN @state = N'ACCEPTED' THEN SYSUTCDATETIME() ELSE NULL END,
       NextAttemptAtUtc = CASE WHEN @state = N'PENDING'
         THEN DATEADD(millisecond, @delayMs, SYSUTCDATETIME()) ELSE NextAttemptAtUtc END
     WHERE EventID = @eventId AND DeliveryState = N'LEASED'
       AND LeaseOwner = @leaseToken AND LeaseUntilUtc > SYSUTCDATETIME()`,
    [
      { name: "state", type: sql.NVarChar(16), value: settlement.state },
      { name: "errorCode", type: sql.NVarChar(64), value: settlement.errorCode },
      { name: "delayMs", type: sql.Int, value: settlement.delayMs ?? 0 },
      { name: "eventId", type: sql.NVarChar(150), value: claim.eventId },
      { name: "leaseToken", type: sql.NVarChar(128), value: claim.leaseToken },
    ],
  );
  return affected === 1;
}
