import { query,sql } from "@/lib/db";
export const RETENTION_PREVIEW_DAYS=[7,30,90,180,365] as const;
export async function getPrivacyInventory(businessId:string,days:number){
 const scope=[{name:"businessId",type:sql.UniqueIdentifier,value:businessId}];
 const [summary,removed]=await Promise.all([
 query<{Messages:number;HiddenMessages:number;OlderMessages:number;OlderMedia:number;HiddenMedia:number}>(
 `SELECT COUNT(1) Messages,
 COALESCE(SUM(CASE WHEN pv.ConversationID IS NULL OR cm.MessageID IS NULL THEN 1 ELSE 0 END),0) HiddenMessages,
 COALESCE(SUM(CASE WHEN m.CreatedAtUtc<DATEADD(day,-@days,SYSUTCDATETIME()) THEN 1 ELSE 0 END),0) OlderMessages,
 COALESCE(SUM(CASE WHEN m.CreatedAtUtc<DATEADD(day,-@days,SYSUTCDATETIME()) AND m.MediaStorageKey IS NOT NULL THEN 1 ELSE 0 END),0) OlderMedia,
 COALESCE(SUM(CASE WHEN (pv.ConversationID IS NULL OR cm.MessageID IS NULL) AND m.MediaStorageKey IS NOT NULL THEN 1 ELSE 0 END),0) HiddenMedia
 FROM dbo.TblMessage m
 JOIN dbo.TblChannelConnection ch ON ch.BusinessID=m.BusinessID AND ch.ChannelConnectionID=m.ChannelConnectionID AND ch.Channel=N'WHATSAPP'
 LEFT JOIN dbo.VwPrivacyCurrentMessage cm ON cm.BusinessID=m.BusinessID AND cm.MessageID=m.MessageID
 LEFT JOIN dbo.VwPrivacyVisibleConversation pv ON pv.BusinessID=m.BusinessID AND pv.ConversationID=m.ConversationID
 WHERE m.BusinessID=@businessId AND m.PrivacyPurgedAtUtc IS NULL`,[...scope,{name:"days",type:sql.Int,value:days}]),
 query<{PhoneNormalized:string;RemovedAtUtc:Date}>("SELECT PhoneNormalized,RemovedAtUtc FROM dbo.TblWhatsAppRemovedContact WHERE BusinessID=@businessId ORDER BY RemovedAtUtc DESC",scope)
 ]);
 const s=summary.recordset[0];
 return {messages:Number(s?.Messages??0),hiddenMessages:Number(s?.HiddenMessages??0),olderMessages:Number(s?.OlderMessages??0),olderMedia:Number(s?.OlderMedia??0),hiddenMedia:Number(s?.HiddenMedia??0),days,removed:removed.recordset.map(r=>({phone:r.PhoneNormalized,removedAtUtc:r.RemovedAtUtc.toISOString()}))};
}
