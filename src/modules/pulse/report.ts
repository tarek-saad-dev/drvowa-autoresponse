import { query, sql } from "@/lib/db";
import { PULSE_INTENT_LABELS, type PulseIntent } from "./classifier";
import { pulseBounds, type PulsePeriod } from "./time";
import { presentEscalationReview, type EscalationReviewIssue } from "./review-presentation";

export type PulseReview={
  conversationId:string;intent:string;label:string;evidence:string;
  priority:"URGENT"|"NORMAL";actionType:"REVIEW"|"OPPORTUNITY";
  name:string;at:string;kind:"SIGNAL"|"ESCALATION";issueType?:EscalationReviewIssue;
};
export type PulseSnapshot={
  period:PulsePeriod; start:string; end:string;
  conversations:number;messages:number;aiConversations:number;
  eligible:number;analyzed:number;openFollowups:number;pendingSignals:number;
  handlingSignals:number;handlingFollowups:number;needsAttentionFollowups:number;
  quotaBlockedFollowups:number;
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
 const reviewLimit=Math.min(100,Math.max(1,Math.trunc(input.maxReviews??12)));
 const reviewArgs=[...a,{name:"reviewLimit",type:sql.Int,value:reviewLimit}];

 // Filter by the latest event that requires attention, not by the age of an
 // unresolved case. A customer follow-up can make an older request actionable
 // again today (or yesterday). Bounds are business-local calendar dates.
 const followupAttentionAt="COALESCE(e.LastCustomerReplyAtUtc,e.CreatedAtUtc)";
 const followupActivityAt=[
  "CASE WHEN e.FollowUpPhase=N'NEEDS_ATTENTION'",
  "THEN COALESCE(e.LastCustomerReplyAtUtc,e.CreatedAtUtc)",
  "WHEN e.FollowUpPhase IN(N'IN_PROGRESS',N'WAITING_CUSTOMER')",
  "THEN COALESCE(e.LastHumanReplyAtUtc,e.CreatedAtUtc)",
  "ELSE e.CreatedAtUtc END",
 ].join(" ");
 const signalAttentionAt="COALESCE(p.LastCustomerFollowupAtUtc,p.MessageAtUtc)";
 const signalHandlingAt="COALESCE(p.LastHumanReplyAtUtc,p.MessageAtUtc)";
 // The same open escalation must own the conversation in both the visible
 // list and the count, even when its original creation is outside the period.
 const withoutOpenEscalation=[
  "AND NOT EXISTS(SELECT 1 FROM dbo.TblHumanEscalation e",
  "WHERE e.BusinessID=p.BusinessID AND e.ConversationID=p.ConversationID",
  "AND e.ResolvedAtUtc IS NULL AND e.Status IN(N'OPEN',N'ACKNOWLEDGED'))",
 ].join(" ");

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
  query<{ConversationID:string;Name:string|null;Reason:string|null;ReasonCode:string|null;LastCustomerText:string|null;At:Date}>([
   "SELECT TOP (@reviewLimit) e.ConversationID,",
   "COALESCE(NULLIF(LTRIM(RTRIM(ct.DisplayName)),N''),NULLIF(ct.PhoneNormalized,N''),N'عميل') AS Name,",
   "e.ReasonText AS Reason,e.ReasonCode AS ReasonCode,lastInbound.LastCustomerText,",
   `${followupAttentionAt} AS At FROM dbo.TblHumanEscalation e`,
   "JOIN dbo.TblConversation c ON c.BusinessID=e.BusinessID AND c.ConversationID=e.ConversationID",
   "JOIN dbo.TblContact ct ON ct.BusinessID=c.BusinessID AND ct.ContactID=c.ContactID",
   "OUTER APPLY (SELECT TOP (1) LEFT(m.TextContent,240) AS LastCustomerText",
   "FROM dbo.TblMessage m WHERE m.BusinessID=e.BusinessID AND m.ConversationID=e.ConversationID",
   "AND m.Direction=N'INBOUND' AND m.IsHistorical=0 AND m.TextContent IS NOT NULL",
   "ORDER BY COALESCE(m.ProviderTimestampUtc,m.ReceivedAtUtc,m.CreatedAtUtc) DESC,m.CreatedAtUtc DESC) lastInbound",
   "WHERE e.BusinessID=@businessId AND e.ResolvedAtUtc IS NULL",
   "AND e.Status IN(N'OPEN',N'ACKNOWLEDGED') AND e.FollowUpPhase=N'NEEDS_ATTENTION'",
   `AND ${followupAttentionAt}>=@start AND ${followupAttentionAt}<@end`,
   `ORDER BY ${followupAttentionAt} DESC,e.CreatedAtUtc DESC`
  ].join(" "),reviewArgs),
  query<{ConversationID:string;Name:string|null;Intent:string;Priority:string;ActionType:string;Evidence:string;At:Date}>([
   "SELECT TOP (@reviewLimit) p.ConversationID,ct.DisplayName AS Name,p.Intent,p.Priority,p.ActionType,",
   "p.Evidence,p.ActionAt AS At FROM",
   `(SELECT p.*,${signalAttentionAt} AS ActionAt,ROW_NUMBER() OVER(PARTITION BY p.ConversationID,p.Intent`,
   `ORDER BY ${signalAttentionAt} DESC,p.SignalID DESC) AS rn FROM dbo.TblPulseSignal p`,
   "WHERE p.BusinessID=@businessId AND p.ActionType IS NOT NULL AND p.ReviewStatus=N'OPEN'",
   "AND p.ActionState=N'NEEDS_REPLY'",
   `AND ${signalAttentionAt}>=@start AND ${signalAttentionAt}<@end) p`,
   "JOIN dbo.TblConversation c ON c.ConversationID=p.ConversationID AND c.BusinessID=p.BusinessID",
   "JOIN dbo.TblContact ct ON ct.ContactID=c.ContactID AND ct.BusinessID=c.BusinessID",
   `WHERE p.rn=1 ${withoutOpenEscalation}`,
   "ORDER BY CASE WHEN p.Priority=N'URGENT' THEN 0 ELSE 1 END,p.ActionAt DESC"
  ].join(" "),reviewArgs),
  query<{Total:number;NeedsAttention:number;Handling:number;QuotaBlocked:number}>([
   "SELECT COUNT(1) AS Total,",
   "COALESCE(SUM(CASE WHEN e.FollowUpPhase=N'NEEDS_ATTENTION' THEN 1 ELSE 0 END),0) AS NeedsAttention,",
   "COALESCE(SUM(CASE WHEN e.FollowUpPhase IN(N'IN_PROGRESS',N'WAITING_CUSTOMER') THEN 1 ELSE 0 END),0) AS Handling,",
   "COALESCE(SUM(CASE WHEN e.FollowUpPhase=N'NEEDS_ATTENTION'",
   "AND e.ReasonCode=N'AI_REPLY_FAILED' AND e.ReasonText LIKE N'%QUOTA_EXCEEDED%'",
   "THEN 1 ELSE 0 END),0) AS QuotaBlocked",
   "FROM dbo.TblHumanEscalation e WHERE e.BusinessID=@businessId",
   "AND e.ResolvedAtUtc IS NULL AND e.Status IN(N'OPEN',N'ACKNOWLEDGED')",
   `AND ${followupActivityAt}>=@start AND ${followupActivityAt}<@end`
  ].join(" "),a),
  query<{Total:number}>([
   "SELECT COUNT(1) AS Total FROM (SELECT p.ConversationID,p.Intent FROM dbo.TblPulseSignal p",
   "WHERE p.BusinessID=@businessId AND p.ReviewStatus=N'OPEN' AND p.ActionType IS NOT NULL",
   "AND p.ActionState=N'NEEDS_REPLY'",
   `AND ${signalAttentionAt}>=@start AND ${signalAttentionAt}<@end`,
   withoutOpenEscalation,
   "GROUP BY p.ConversationID,p.Intent) q"
  ].join(" "),a),
  query<{Total:number}>([
   "SELECT COUNT(1) AS Total FROM (SELECT p.ConversationID,p.Intent FROM dbo.TblPulseSignal p",
   "WHERE p.BusinessID=@businessId AND p.ReviewStatus=N'OPEN' AND p.ActionType IS NOT NULL",
   "AND p.ActionState=N'IN_PROGRESS'",
   `AND ${signalHandlingAt}>=@start AND ${signalHandlingAt}<@end`,
   withoutOpenEscalation,
   "GROUP BY p.ConversationID,p.Intent) q"
  ].join(" "),a),
 ]);
 const follow:PulseReview[]=followups.recordset.map(x=>{
  const copy=presentEscalationReview({
   reasonCode:x.ReasonCode,
   reason:x.Reason,
   lastCustomerText:x.LastCustomerText,
  });
  return {
   conversationId:x.ConversationID,intent:"FOLLOW_UP",label:copy.label,
   evidence:copy.evidence,issueType:copy.issueType,priority:"URGENT",
   actionType:"REVIEW",name:x.Name||"عميل",at:x.At.toISOString(),kind:"ESCALATION",
  };
 });
 const inferred:PulseReview[]=signals.recordset.map(x=>({
  conversationId:x.ConversationID,intent:x.Intent,label:PULSE_INTENT_LABELS[x.Intent as PulseIntent]||x.Intent,
  evidence:x.Evidence,priority:x.Priority==="URGENT"?"URGENT":"NORMAL",
  actionType:x.ActionType==="OPPORTUNITY"?"OPPORTUNITY":"REVIEW",
  name:x.Name||"عميل",at:x.At.toISOString(),kind:"SIGNAL",
 }));
 const reviews=[...follow,...inferred].sort((a,b)=>
  (a.priority==="URGENT"?0:1)-(b.priority==="URGENT"?0:1)||b.at.localeCompare(a.at)
 ).slice(0,reviewLimit);
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
  quotaBlockedFollowups:Number(followCount.recordset[0]?.QuotaBlocked??0),
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
