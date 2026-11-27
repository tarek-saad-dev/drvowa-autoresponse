import { query, sql, withTransaction } from "@/lib/db";
import { classifyCustomerText } from "./classifier";
import { assessPulseText, isPulseDisagreement, SHADOW_MODEL } from "./intelligence";

type Candidate={MessageID:string;BusinessID:string;ConversationID:string;TextContent:string};
const dayCap=8;
export async function runPulseShadowBatch():Promise<number>{
 // Disabled by default. Explicit rollout only; hard global daily spend guard.
 if(process.env.PULSE_AI_SHADOW_ENABLED==="false")return 0;
 const count=await query<{Total:number}>(
  "SELECT COUNT(1) AS Total FROM dbo.TblPulseAiAssessment WHERE ReviewedAtUtc>=CAST(SYSUTCDATETIME() AS date)",
 );
 const remaining=Math.min(2,Math.max(0,dayCap-Number(count.recordset[0]?.Total??dayCap)));
 if(!remaining)return 0;
 const result=await query<Candidate>([
  "SELECT TOP (@limit) m.MessageID,m.BusinessID,m.ConversationID,m.TextContent",
  "FROM dbo.TblPulseMessageScan s",
  "JOIN dbo.TblMessage m ON m.MessageID=s.MessageID AND m.BusinessID=s.BusinessID",
  "WHERE m.TextContent IS NOT NULL AND LEN(m.TextContent) BETWEEN 16 AND 800",
  "AND EXISTS (SELECT 1 FROM dbo.VwPrivacyAiEligibleMessage pv WHERE pv.BusinessID=m.BusinessID AND pv.MessageID=m.MessageID)",
  "AND s.ScannedAtUtc>=DATEADD(day,-7,SYSUTCDATETIME())",
  "AND NOT EXISTS(SELECT 1 FROM dbo.TblPulseAiAssessment a WHERE a.MessageID=m.MessageID)",
  "ORDER BY s.ScannedAtUtc DESC,s.MessageID DESC"
 ].join(" "),[{name:"limit",type:sql.Int,value:remaining}]);
 let processed=0;
 for(const msg of result.recordset){
  const allowed=await query<{Allowed:number}>("SELECT TOP 1 1 AS Allowed FROM dbo.VwPrivacyAiEligibleMessage WHERE BusinessID=@businessId AND MessageID=@messageId",[{name:"businessId",type:sql.UniqueIdentifier,value:msg.BusinessID},{name:"messageId",type:sql.UniqueIdentifier,value:msg.MessageID}]);
  if(!allowed.recordset.length)continue;
  const verdict=await assessPulseText(msg.TextContent,{businessId:msg.BusinessID});
  const baseline=classifyCustomerText(msg.TextContent)[0]?.intent??null;
  const disagreement=isPulseDisagreement(baseline,verdict);
  // Save metrics only. Deliberately never mutates actionable signal rows.
  await withTransaction(async trx=>{
   const current=await trx.query("SELECT m.MessageID FROM dbo.TblMessage m WITH(UPDLOCK,HOLDLOCK) WHERE m.BusinessID=@businessId AND m.MessageID=@messageId AND EXISTS(SELECT 1 FROM dbo.VwPrivacyAiEligibleMessage v WHERE v.BusinessID=m.BusinessID AND v.MessageID=m.MessageID)",[{name:"businessId",type:sql.UniqueIdentifier,value:msg.BusinessID},{name:"messageId",type:sql.UniqueIdentifier,value:msg.MessageID}]);
   if(!current.recordset.length)return;
   await trx.query([
   "IF NOT EXISTS(SELECT 1 FROM dbo.TblPulseAiAssessment WITH(UPDLOCK,HOLDLOCK) WHERE MessageID=@messageId)",
   "INSERT INTO dbo.TblPulseAiAssessment(MessageID,BusinessID,ConversationID,Model,Status,Intent,Confidence,Evidence,Disagreement)",
   "VALUES(@messageId,@businessId,@conversationId,@model,@status,@intent,@confidence,@evidence,@disagreement)"
  ].join(" "),[
   {name:"messageId",type:sql.UniqueIdentifier,value:msg.MessageID},
   {name:"businessId",type:sql.UniqueIdentifier,value:msg.BusinessID},
   {name:"conversationId",type:sql.UniqueIdentifier,value:msg.ConversationID},
   {name:"model",type:sql.NVarChar(100),value:SHADOW_MODEL},
   {name:"status",type:sql.NVarChar(24),value:verdict?"COMPLETE":"UNCERTAIN"},
   {name:"intent",type:sql.NVarChar(40),value:verdict?.intent??null},
   {name:"confidence",type:sql.TinyInt,value:verdict?.confidence??null},
   {name:"evidence",type:sql.NVarChar(280),value:verdict?.evidence??null},
   {name:"disagreement",type:sql.Bit,value:disagreement},
  ]);
  });
  processed++;
 }
 return processed;
}
