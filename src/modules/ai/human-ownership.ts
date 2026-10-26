import { query, sql } from "@/lib/db";

export type HumanOwnedChat = {
  conversationId:string;
  name:string;
  waitingForTeam:boolean;
  lastInboundAtUtc:string|null;
};
export type HumanOwnershipSnapshot={
  withTeam:number;
  awaitingTeamReply:number;
  waitingCustomer:number;
  chats:HumanOwnedChat[];
};

/** Same persisted TblConversationAiState.Mode used by Inbox and AI reply gates.
 * No historical time filter: ownership is live even if it started yesterday.
 * Follow-up escalation timestamps can serve as verified human reply evidence.
 */
export async function getHumanOwnershipSnapshot(businessId:string):Promise<HumanOwnershipSnapshot>{
  const res=await query<{
    ConversationID:string;
    Name:string|null;
    LastInboundAtUtc:Date|null;
    AwaitingReply:number;
    Total:number;
    AwaitingCount:number;
  }>(`
  WITH active AS (
    SELECT c.ConversationID, ct.DisplayName AS Name, c.LastInboundAtUtc,
      CASE WHEN c.LastInboundAtUtc IS NOT NULL
        AND c.LastInboundAtUtc > COALESCE(
          CASE
            WHEN s.LastHumanReplyAtUtc IS NULL THEN e.LastHumanReplyAtUtc
            WHEN e.LastHumanReplyAtUtc IS NULL THEN s.LastHumanReplyAtUtc
            WHEN e.LastHumanReplyAtUtc > s.LastHumanReplyAtUtc THEN e.LastHumanReplyAtUtc
            ELSE s.LastHumanReplyAtUtc END,
          s.PausedAtUtc, c.CreatedAtUtc)
        THEN 1 ELSE 0 END AS AwaitingReply
    FROM dbo.TblConversationAiState s
    INNER JOIN dbo.TblConversation c ON c.BusinessID=s.BusinessID AND c.ConversationID=s.ConversationID
    INNER JOIN dbo.TblContact ct ON ct.BusinessID=c.BusinessID AND ct.ContactID=c.ContactID
    OUTER APPLY (
      SELECT MAX(e.LastHumanReplyAtUtc) AS LastHumanReplyAtUtc
      FROM dbo.TblHumanEscalation e
      WHERE e.BusinessID=s.BusinessID AND e.ConversationID=s.ConversationID
        AND e.ResolvedAtUtc IS NULL AND e.Status IN (N'OPEN',N'ACKNOWLEDGED')
    ) e
    WHERE s.BusinessID=@businessId AND s.Mode=N'HUMAN_PAUSED'
  )
  SELECT TOP (5) ConversationID,Name,LastInboundAtUtc,AwaitingReply,
    COUNT(*) OVER() AS Total,
    SUM(AwaitingReply) OVER() AS AwaitingCount
  FROM active
  ORDER BY AwaitingReply DESC,LastInboundAtUtc DESC,ConversationID DESC
  `,[{name:"businessId",type:sql.UniqueIdentifier,value:businessId}]);
  const rows=res.recordset;
  const withTeam=Number(rows[0]?.Total??0);
  const awaitingTeamReply=Number(rows[0]?.AwaitingCount??0);
  return {
    withTeam,awaitingTeamReply,waitingCustomer:Math.max(0,withTeam-awaitingTeamReply),
    chats:rows.map(x=>({
      conversationId:x.ConversationID,
      name:x.Name?.trim()||"عميل",
      waitingForTeam:Boolean(x.AwaitingReply),
      lastInboundAtUtc:x.LastInboundAtUtc?.toISOString()??null,
    })),
  };
}
