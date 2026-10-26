import { query, sql, withTransaction } from "@/lib/db";
import { classifyCustomerText } from "./classifier";

type Pending={ MessageID:string; BusinessID:string; ConversationID:string; TextContent:string; MessageAtUtc:Date };
export async function scanPulseBatch(limit=120):Promise<number> {
  const result=await query<Pending>([
    "SELECT TOP (@limit) m.MessageID,m.BusinessID,m.ConversationID,m.TextContent,",
    "COALESCE(m.ProviderTimestampUtc,m.ReceivedAtUtc) AS MessageAtUtc FROM dbo.TblMessage m",
    "WHERE m.Direction=N'INBOUND' AND m.IsHistorical=0 AND m.ContentType=N'TEXT'",
    "AND m.TextContent IS NOT NULL AND m.ReceivedAtUtc>=DATEADD(day,-60,SYSUTCDATETIME())",
    "AND NOT EXISTS(SELECT 1 FROM dbo.TblPulseMessageScan s WHERE s.MessageID=m.MessageID)",
    "ORDER BY m.ReceivedAtUtc DESC,m.MessageID DESC"
  ].join(" "),[{name:"limit",type:sql.Int,value:Math.max(1,Math.min(200,limit))}]);
  if(!result.recordset.length)return 0;
  const scans:object[]=[],signals:object[]=[];
  for(const m of result.recordset){
    const detected=classifyCustomerText(m.TextContent);
    const common={messageId:m.MessageID,businessId:m.BusinessID,conversationId:m.ConversationID,at:m.MessageAtUtc.toISOString()};
    scans.push({...common,count:detected.length});
    for(const signal of detected)signals.push({...common,...signal});
  }
  // Atomic, idempotent inserts. Never sends customer-facing messages.
  await withTransaction(async trx=>{
    await trx.execute([
      "INSERT INTO dbo.TblPulseMessageScan(MessageID,BusinessID,ConversationID,MessageAtUtc,SignalCount)",
      "SELECT j.MessageID,j.BusinessID,j.ConversationID,j.MessageAtUtc,j.SignalCount",
      "FROM OPENJSON(@payload) WITH (MessageID uniqueidentifier '$.messageId',",
      "BusinessID uniqueidentifier '$.businessId',ConversationID uniqueidentifier '$.conversationId',",
      "MessageAtUtc datetime2 '$.at',SignalCount int '$.count') j",
      "WHERE NOT EXISTS(SELECT 1 FROM dbo.TblPulseMessageScan p WITH(UPDLOCK,HOLDLOCK) WHERE p.MessageID=j.MessageID)"
    ].join(" "),[{name:"payload",type:sql.NVarChar(sql.MAX),value:JSON.stringify(scans)}]);
    if(signals.length)await trx.execute([
      "INSERT INTO dbo.TblPulseSignal(BusinessID,ConversationID,MessageID,MessageAtUtc,Intent,Priority,ActionType,Confidence,Evidence,ActionState,LastHumanReplyAtUtc,ActionSource)",
      "SELECT j.BusinessID,j.ConversationID,j.MessageID,j.MessageAtUtc,j.Intent,j.Priority,j.ActionType,j.Confidence,j.Evidence,",
      "CASE WHEN h.RepliedAtUtc IS NOT NULL AND j.ActionType IS NOT NULL THEN N'IN_PROGRESS' ELSE N'NEEDS_REPLY' END,",
      "h.RepliedAtUtc,CASE WHEN h.RepliedAtUtc IS NOT NULL THEN N'HUMAN_REPLY_BACKFILL' ELSE NULL END",
      "FROM OPENJSON(@payload) WITH (MessageID uniqueidentifier '$.messageId',BusinessID uniqueidentifier '$.businessId',",
      "ConversationID uniqueidentifier '$.conversationId',MessageAtUtc datetime2 '$.at',Intent nvarchar(40) '$.intent',",
      "Priority nvarchar(20) '$.priority',ActionType nvarchar(32) '$.actionType',",
      "Confidence tinyint '$.confidence',Evidence nvarchar(280) '$.evidence') j",
      "OUTER APPLY (SELECT MAX(actions.AtUtc) RepliedAtUtc FROM (",
      "SELECT MAX(COALESCE(m.ProviderTimestampUtc,m.ReceivedAtUtc)) AS AtUtc",
      "FROM dbo.TblMessage m WHERE m.BusinessID=j.BusinessID AND m.ConversationID=j.ConversationID",
      "AND m.Direction=N'OUTBOUND' AND m.Origin=N'HUMAN'",
      "AND COALESCE(m.ProviderTimestampUtc,m.ReceivedAtUtc)>j.MessageAtUtc",
      "UNION ALL SELECT MAX(COALESCE(o.OccurredAtUtc,o.CreatedAtUtc))",
      "FROM dbo.TblWhatsappOutboundObservation o",
      "WHERE o.BusinessID=j.BusinessID AND o.ConversationID=j.ConversationID",
      "AND o.Origin=N'HUMAN_MANUAL'",
      "AND COALESCE(o.OccurredAtUtc,o.CreatedAtUtc)>j.MessageAtUtc",
      ") actions) h",
      "WHERE NOT EXISTS(SELECT 1 FROM dbo.TblPulseSignal p WITH(UPDLOCK,HOLDLOCK)",
      "WHERE p.MessageID=j.MessageID AND p.Intent=j.Intent)"
    ].join(" "),[{name:"payload",type:sql.NVarChar(sql.MAX),value:JSON.stringify(signals)}]);
  });
  return result.recordset.length;
}
