import { query, sql, type TransactionClient } from "@/lib/db";
import { explicitlyConfirmedResolved } from "./followup-policy";

/**
 * A follow-up case is independent of the AI mode. Human responses move it to
 * IN_PROGRESS but do not close it. Only an explicit subsequent customer
 * confirmation can auto-close it.
 *
 * All transitions use guarded SQL UPDATE + OUTPUT inside the caller's transaction
 * and log exactly one auditable event per actual state change.
 */
type Scope = { businessId: string; conversationId: string };
type EventRow = { EscalationID: string; ConversationID: string };
const scopeArgs = ({ businessId, conversationId }: Scope) => [
  { name: "businessId", type: sql.UniqueIdentifier, value: businessId },
  { name: "conversationId", type: sql.UniqueIdentifier, value: conversationId },
];
async function audit(trx: TransactionClient, scope: Scope, row: EventRow, key: string, kind: string, at: Date) {
  await trx.execute(
    `INSERT INTO dbo.TblFollowUpEvent (BusinessID,EscalationID,ConversationID,EventKey,EventType,EventAtUtc)
      VALUES (@businessId,@escalationId,@conversationId,@key,@kind,@at)`,
    [
      ...scopeArgs(scope),
      { name: "escalationId", type: sql.UniqueIdentifier, value: row.EscalationID },
      { name: "key", type: sql.NVarChar(160), value: key.slice(0, 160) },
      { name: "kind", type: sql.NVarChar(40), value: kind },
      { name: "at", type: sql.DateTime2, value: at },
    ],
  );
}

export async function recordHumanFollowUpReply(params: Scope & {
  providerMessageId: string;
  repliedAtUtc: Date;
}, trx: TransactionClient): Promise<boolean> {
  const rows = await trx.query<EventRow>(
    `UPDATE e
        SET Status = N'ACKNOWLEDGED',
            FollowUpPhase = N'IN_PROGRESS',
            AcknowledgedAtUtc = COALESCE(e.AcknowledgedAtUtc, @at),
            LastHumanReplyAtUtc = @at,
            CustomerHoldNextAtUtc = NULL,
            CustomerHoldClaimedAtUtc = NULL,
            UpdatedAtUtc = SYSUTCDATETIME()
        OUTPUT INSERTED.EscalationID, INSERTED.ConversationID
        FROM dbo.TblHumanEscalation e WITH (UPDLOCK)
        WHERE e.BusinessID = @businessId AND e.ConversationID = @conversationId
          AND e.ResolvedAtUtc IS NULL AND e.Status IN (N'OPEN', N'ACKNOWLEDGED')
          AND @at >= e.CreatedAtUtc
          AND (e.LastHumanReplyAtUtc IS NULL OR @at > e.LastHumanReplyAtUtc)`,
    [
      ...scopeArgs(params),
      { name: "at", type: sql.DateTime2, value: params.repliedAtUtc },
    ],
  );
  const row = rows.recordset[0];
  if (!row) return false;
  await audit(trx, params, row, "HUMAN:" + params.providerMessageId, "HUMAN_REPLIED", params.repliedAtUtc);
  return true;
}

export async function recordCustomerFollowUpReply(params: Scope & {
  messageId: string;
  text: string | null;
  receivedAtUtc: Date;
}, trx: TransactionClient): Promise<"RESOLVED" | "NEEDS_ATTENTION" | "UNCHANGED"> {
  const explicit = explicitlyConfirmedResolved(params.text);
  if (explicit) {
    const result = await trx.query<EventRow>(
      `UPDATE e
         SET Status = N'RESOLVED',
             FollowUpPhase = N'RESOLVED',
             ResolvedAtUtc = @at,
             ResolutionSource = N'CUSTOMER_EXPLICIT',
             ResolutionEvidenceMessageID = @messageId,
             LastCustomerReplyAtUtc = @at,
             CustomerHoldNextAtUtc = NULL,
             CustomerHoldClaimedAtUtc = NULL,
             NotificationStatus = CASE WHEN e.NotificationStatus = N'PENDING'
               THEN N'CANCELLED' ELSE e.NotificationStatus END,
             UpdatedAtUtc = SYSUTCDATETIME()
        OUTPUT INSERTED.EscalationID, INSERTED.ConversationID
        FROM dbo.TblHumanEscalation e WITH (UPDLOCK)
        WHERE e.BusinessID = @businessId AND e.ConversationID = @conversationId
          AND e.ResolvedAtUtc IS NULL AND e.Status IN (N'OPEN', N'ACKNOWLEDGED')
          AND e.LastHumanReplyAtUtc IS NOT NULL
          AND @at > e.LastHumanReplyAtUtc`,
      [
        ...scopeArgs(params),
        { name: "at", type: sql.DateTime2, value: params.receivedAtUtc },
        { name: "messageId", type: sql.UniqueIdentifier, value: params.messageId },
      ],
    );
    const row = result.recordset[0];
    if (row) {
      await audit(trx, params, row, "CUSTOMER_RESOLVED:" + params.messageId, "CUSTOMER_CONFIRMED_RESOLVED", params.receivedAtUtc);
      // Only reverse the bot pause that was explicitly caused by escalation.
      // Respect manual takeover, safety pauses, and any other owner control.
      await trx.execute(
        `UPDATE dbo.TblConversationAiState
          SET Mode=N'AUTO', PauseReason=NULL, PausedAtUtc=NULL, LastHumanReplyAtUtc=NULL,
              ResumedAtUtc=SYSUTCDATETIME(), UpdatedAtUtc=SYSUTCDATETIME()
          WHERE BusinessID=@businessId AND ConversationID=@conversationId
            AND Mode=N'HUMAN_PAUSED' AND PauseReason=N'ESCALATION'`,
        scopeArgs(params),
      );
      return "RESOLVED";
    }
  }

  // After an actual human response, a new customer question puts the issue
  // back in the human's queue. Never replace a newer event with a late replay.
  const result = await trx.query<EventRow>(
    `UPDATE e
       SET FollowUpPhase = N'NEEDS_ATTENTION',
           LastCustomerReplyAtUtc = @at,
           UpdatedAtUtc = SYSUTCDATETIME()
       OUTPUT INSERTED.EscalationID, INSERTED.ConversationID
       FROM dbo.TblHumanEscalation e WITH (UPDLOCK)
      WHERE e.BusinessID = @businessId AND e.ConversationID = @conversationId
        AND e.ResolvedAtUtc IS NULL AND e.Status IN (N'OPEN', N'ACKNOWLEDGED')
        AND e.LastHumanReplyAtUtc IS NOT NULL AND @at > e.LastHumanReplyAtUtc
        AND (e.LastCustomerReplyAtUtc IS NULL OR @at > e.LastCustomerReplyAtUtc)`,
    [
      ...scopeArgs(params),
      { name: "at", type: sql.DateTime2, value: params.receivedAtUtc },
    ],
  );
  const row = result.recordset[0];
  if (!row) return "UNCHANGED";
  await audit(trx, params, row, "CUSTOMER:" + params.messageId, "CUSTOMER_REPLIED", params.receivedAtUtc);
  return "NEEDS_ATTENTION";
}

export async function listFollowUpEvents(params: Scope, limit = 10) {
  const result = await query<{ EventType: string; EventAtUtc: Date }>(
    `SELECT TOP (@limit) f.EventType, f.EventAtUtc
       FROM dbo.TblFollowUpEvent f
       INNER JOIN dbo.TblHumanEscalation e
         ON e.EscalationID = f.EscalationID AND e.BusinessID = f.BusinessID
      WHERE e.BusinessID = @businessId AND e.ConversationID = @conversationId
      ORDER BY f.EventAtUtc DESC, f.CreatedAtUtc DESC`,
    [...scopeArgs(params), { name: "limit", type: sql.Int, value: Math.min(Math.max(limit, 1), 30) }],
  );
  return result.recordset.map(row => ({ type: row.EventType, at: row.EventAtUtc.toISOString() }));
}

/** A resolved case reopens only if the customer explicitly reports the SAME
 * issue returning within 14 days. This never guesses from generic complaints.
 */
export async function hadRecentlyResolvedFollowUp(params: Scope & {
  atUtc: Date;
}): Promise<boolean> {
  const rows = await query<{ EscalationID: string }>(
    `SELECT TOP 1 EscalationID FROM dbo.TblHumanEscalation
      WHERE BusinessID=@businessId AND ConversationID=@conversationId
        AND ResolvedAtUtc IS NOT NULL
        AND ResolvedAtUtc BETWEEN DATEADD(day,-14,@at) AND @at
        AND ResolutionSource IN (N'CUSTOMER_EXPLICIT',N'MANUAL_CONFIRMED')
      ORDER BY ResolvedAtUtc DESC`,
    [...scopeArgs(params), { name: "at", type: sql.DateTime2, value: params.atUtc }],
  );
  return Boolean(rows.recordset[0]);
}
