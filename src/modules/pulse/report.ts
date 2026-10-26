import { query, sql } from "@/lib/db";
import { PULSE_INTENT_LABELS, type PulseIntent } from "./classifier";
import { pulseBounds, type PulsePeriod } from "./time";

export type PulseReview={
  conversationId:string;intent:string;label:string;evidence:string;
  priority:"URGENT"|"NORMAL";actionType:"REVIEW"|"OPPORTUNITY";
  name:string;at:string;kind:"SIGNAL"|"ESCALATION";
};
export type PulseSnapshot={
  period:PulsePeriod; start:string; end:string;
  conversations:number;messages:number;aiConversations:number;
  eligible:number;analyzed:number;openFollowups:number;pendingSignals:number;
  handlingSignals:number;handlingFollowups:number;needsAttentionFollowups:number;
  categories:Array<{intent:PulseIntent;label:string;conversations:number}>;
  reviews:PulseReview[];
};
function args(businessId:string) {
 return [{name:"businessId",type:sql.UniqueIdentifier,value:businessId}];
}
export async function getPulseSnapshot(input:{
 businessId:string;period:PulsePeriod;timezone:string;maxReviews?:number;
}):Promise<PulseSnapshot>{
 const {start,end}=pulseBounds(input.period,input.timezone);
 const a=[...args(input.businessId),{name:"start",type:sql.DateTime2,value:start},
   {name:"end",type:sql.DateTime2,value:end}];
 const [volume,ai,coverage,topics,followups,signals,followCount,signalCount,handlingSignals]=await Promise.all([
  query<{Conversations:number;Messages:number;Eligible:number}>([
   "SELECT COUNT(DISTINCT m.ConversationID) AS Conversations,COUNT(1) AS Messages,",
   "COALESCE(SUM(CASE WHEN m.ContentType=N'TEXT' AND m.TextContent IS NOT NULL THEN 1 ELSE 0 END),0) AS Eligible",
   "FROM dbo.TblMessage m WHERE m.BusinessID=@businessId AND m.Direction=N'INBOUND' AND m.IsHistorical=0",
   "AND COALESCE(m.ProviderTimestampUtc,m.ReceivedAtUtc)>=@start",
   "AND COALESCE(m.ProviderTimestampUtc,m.ReceivedAtUtc)<@end"
  ].join(" "),a),
  query<{Total:number}>([
   "SELECT COUNT(DISTINCT m.ConversationID) AS Total FROM dbo.TblMessage m",
   "WHERE m.BusinessID=@businessId AND m.Direction=N'OUTBOUND' AND m.Origin=N'AI'",
   "AND m.IsHistorical=0 AND COALESCE(m.ProviderTimestampUtc,m.ReceivedAtUtc)>=@start",
   "AND COALESCE(m.ProviderTimestampUtc,m.ReceivedAtUtc)<@end"
  ].join(" "),a),
  query<{Total:number}>([
   "SELECT COUNT(1) AS Total FROM dbo.TblPulseMessageScan p",
   "WHERE p.BusinessID=@businessId AND p.MessageAtUtc>=@start AND p.MessageAtUtc<@end"
  ].join(" "),a),
  query<{Intent:PulseIntent;Total:number}>([
   "SELECT Intent,COUNT(DISTINCT ConversationID) AS Total FROM dbo.TblPulseSignal",
   "WHERE BusinessID=@businessId AND MessageAtUtc>=@start AND MessageAtUtc<@end",
   "GROUP BY Intent ORDER BY Total DESC"
  ].join(" "),a),
  query<{ConversationID:string;Name:string|null;Reason:string;Phase:string;At:Date}>([
   "SELECT TOP (30) e.ConversationID,ct.DisplayName AS Name,e.ReasonText AS Reason,",
   "e.FollowUpPhase AS Phase,e.CreatedAtUtc AS At FROM dbo.TblHumanEscalation e",
   "JOIN dbo.TblConversation c ON c.BusinessID=e.BusinessID AND c.ConversationID=e.ConversationID",
   "JOIN dbo.TblContact ct ON ct.BusinessID=c.BusinessID AND ct.ContactID=c.ContactID",
   "WHERE e.BusinessID=@businessId AND e.ResolvedAtUtc IS NULL",
   "AND e.Status IN(N'OPEN',N'ACKNOWLEDGED')",
   "ORDER BY CASE WHEN e.FollowUpPhase=N'NEEDS_ATTENTION' THEN 0 ELSE 1 END,e.CreatedAtUtc DESC"
  ].join(" "),args(input.businessId)),
  query<{ConversationID:string;Name:string|null;Intent:string;Priority:string;ActionType:string;Evidence:string;At:Date}>([
   "SELECT TOP (40) p.ConversationID,ct.DisplayName AS Name,p.Intent,p.Priority,p.ActionType,",
   "p.Evidence,p.MessageAtUtc AS At FROM",
   "(SELECT p.*,ROW_NUMBER() OVER(PARTITION BY p.ConversationID,p.Intent",
   "ORDER BY p.MessageAtUtc DESC,p.SignalID DESC) AS rn FROM dbo.TblPulseSignal p",
   "WHERE p.BusinessID=@businessId AND p.ActionType IS NOT NULL AND p.ReviewStatus=N'OPEN'",
   "AND p.ActionState=N'NEEDS_REPLY'",
   "AND p.MessageAtUtc>=DATEADD(day,-60,SYSUTCDATETIME())) p",
   "JOIN dbo.TblConversation c ON c.ConversationID=p.ConversationID AND c.BusinessID=p.BusinessID",
   "JOIN dbo.TblContact ct ON ct.ContactID=c.ContactID AND ct.BusinessID=c.BusinessID",
   "WHERE p.rn=1 ORDER BY CASE WHEN p.Priority=N'URGENT' THEN 0 ELSE 1 END,p.MessageAtUtc DESC"
  ].join(" "),args(input.businessId)),
  query<{Total:number; NeedsAttention:number; Handling:number}>([
   "SELECT COUNT(1) AS Total,",
   "COALESCE(SUM(CASE WHEN e.FollowUpPhase=N'NEEDS_ATTENTION' THEN 1 ELSE 0 END),0) AS NeedsAttention,",
   "COALESCE(SUM(CASE WHEN e.FollowUpPhase IN(N'IN_PROGRESS',N'WAITING_CUSTOMER') THEN 1 ELSE 0 END),0) AS Handling",
   "FROM dbo.TblHumanEscalation e WHERE e.BusinessID=@businessId",
   "AND e.ResolvedAtUtc IS NULL AND e.Status IN(N'OPEN',N'ACKNOWLEDGED')"
  ].join(" "),args(input.businessId)),
  query<{Total:number}>([
   "SELECT COUNT(1) AS Total FROM (SELECT p.ConversationID,p.Intent FROM dbo.TblPulseSignal p",
   "WHERE p.BusinessID=@businessId AND p.ReviewStatus=N'OPEN' AND p.ActionType IS NOT NULL",
   "AND p.ActionState=N'NEEDS_REPLY'",
   "AND p.MessageAtUtc>=DATEADD(day,-60,SYSUTCDATETIME())",
   "AND NOT EXISTS(SELECT 1 FROM dbo.TblHumanEscalation e WHERE e.BusinessID=p.BusinessID",
   "AND e.ConversationID=p.ConversationID AND e.ResolvedAtUtc IS NULL",
   "AND e.Status IN(N'OPEN',N'ACKNOWLEDGED'))",
   "GROUP BY p.ConversationID,p.Intent) q"
  ].join(" "),args(input.businessId)),
  query<{Total:number}>([
   "SELECT COUNT(1) AS Total FROM (SELECT p.ConversationID,p.Intent",
   "FROM dbo.TblPulseSignal p WHERE p.BusinessID=@businessId",
   "AND p.ReviewStatus=N'OPEN' AND p.ActionType IS NOT NULL",
   "AND p.ActionState=N'IN_PROGRESS' AND p.MessageAtUtc>=DATEADD(day,-60,SYSUTCDATETIME())",
   "AND NOT EXISTS(SELECT 1 FROM dbo.TblHumanEscalation e WHERE e.BusinessID=p.BusinessID",
   "AND e.ConversationID=p.ConversationID AND e.ResolvedAtUtc IS NULL",
   "AND e.Status IN(N'OPEN',N'ACKNOWLEDGED'))",
   "GROUP BY p.ConversationID,p.Intent) q"
  ].join(" "),args(input.businessId)),
 ]);
 const follow:PulseReview[]=followups.recordset
   .filter(x=>x.Phase==="NEEDS_ATTENTION")
   .map(x=>({
  conversationId:x.ConversationID,intent:"FOLLOW_UP",label:x.Phase==="IN_PROGRESS"?"جاري التعامل":"متابعة بشرية",
  evidence:x.Reason||"متابعة مفتوحة",priority:x.Phase==="NEEDS_ATTENTION"?"URGENT":"NORMAL",
  actionType:"REVIEW",name:x.Name||"عميل",at:x.At.toISOString(),kind:"ESCALATION",
 }));
 // An open Smart Follow-up owns this conversation even when a human is handling it.
 const openIds=new Set(followups.recordset.map(x=>x.ConversationID));
 const inferred:PulseReview[]=signals.recordset.filter(x=>!openIds.has(x.ConversationID)).map(x=>({
  conversationId:x.ConversationID,intent:x.Intent,label:PULSE_INTENT_LABELS[x.Intent as PulseIntent]||x.Intent,
  evidence:x.Evidence,priority:x.Priority==="URGENT"?"URGENT":"NORMAL",
  actionType:x.ActionType==="OPPORTUNITY"?"OPPORTUNITY":"REVIEW",
  name:x.Name||"عميل",at:x.At.toISOString(),kind:"SIGNAL",
 }));
 const reviews=[...follow,...inferred].sort((a,b)=>
  (a.priority==="URGENT"?0:1)-(b.priority==="URGENT"?0:1)||b.at.localeCompare(a.at)
 ).slice(0,input.maxReviews??12);
 return {period:input.period,start:start.toISOString(),end:end.toISOString(),
  conversations:Number(volume.recordset[0]?.Conversations??0),
  messages:Number(volume.recordset[0]?.Messages??0),
  aiConversations:Number(ai.recordset[0]?.Total??0),
  eligible:Number(volume.recordset[0]?.Eligible??0),
  analyzed:Number(coverage.recordset[0]?.Total??0),
  openFollowups:Number(followCount.recordset[0]?.Total??0),
  pendingSignals:Number(signalCount.recordset[0]?.Total??0),
  categories:topics.recordset.map(x=>({intent:x.Intent,label:PULSE_INTENT_LABELS[x.Intent]||x.Intent,conversations:Number(x.Total)})),
  handlingSignals:Number(handlingSignals.recordset[0]?.Total??0),
  handlingFollowups:Number(followCount.recordset[0]?.Handling??0),
  needsAttentionFollowups:Number(followCount.recordset[0]?.NeedsAttention??0),
  reviews,
 };
}
export async function markPulseSignalReviewed(input:{businessId:string;conversationId:string;intent:PulseIntent}) {
 const r=await query([
  "UPDATE dbo.TblPulseSignal SET ReviewStatus=N'REVIEWED',ReviewedAtUtc=SYSUTCDATETIME(),",
  "ActionState=N'DISMISSED',ActionSource=N'MANUAL_DISMISSED',ActionUpdatedAtUtc=SYSUTCDATETIME()",
  "WHERE BusinessID=@businessId AND ConversationID=@conversationId AND Intent=@intent",
  "AND ActionType IS NOT NULL AND ReviewStatus=N'OPEN'"
 ].join(" "),[...args(input.businessId),{name:"conversationId",type:sql.UniqueIdentifier,value:input.conversationId},
 {name:"intent",type:sql.NVarChar(40),value:input.intent}]);
 return r.rowsAffected.reduce((s,n)=>s+n,0);
}
