import { randomUUID } from "node:crypto";
import { query,sql,withTransaction } from "@/lib/db";
import {getResetCleanupStatus} from "./privacy-purge-service";
const scope=(businessId:string)=>[{name:"businessId",type:sql.UniqueIdentifier,value:businessId}];
const wa=(a:string)=>`EXISTS(SELECT 1 FROM dbo.TblChannelConnection ch WHERE ch.BusinessID=${a}.BusinessID AND ch.ChannelConnectionID=${a}.ChannelConnectionID AND ch.Channel=N'WHATSAPP')`;
export async function getWorkspaceResetRevision(businessId:string){
 const r=await query<{ResetID:string;ResetAtUtc:Date}>("SELECT ResetID,ResetAtUtc FROM dbo.TblWhatsAppWorkspaceReset WHERE BusinessID=@businessId",scope(businessId));
 return r.recordset[0]?{id:r.recordset[0].ResetID,at:r.recordset[0].ResetAtUtc.toISOString()}:null;
}
export async function previewWorkspaceReset(businessId:string){
 const r=await query<{Conversations:number;Contacts:number;Messages:number}>(`
 SELECT
 (SELECT COUNT(*) FROM dbo.TblConversation c WHERE c.BusinessID=@businessId AND ${wa("c")} AND (NOT EXISTS(SELECT 1 FROM dbo.TblWhatsAppWorkspaceReset rr WHERE rr.BusinessID=c.BusinessID) OR EXISTS(SELECT 1 FROM dbo.VwPrivacyCurrentMessage v WHERE v.BusinessID=c.BusinessID AND v.ConversationID=c.ConversationID))) Conversations,
 (SELECT COUNT(*) FROM dbo.TblContact ct WHERE ct.BusinessID=@businessId AND ${wa("ct")} AND (NOT EXISTS(SELECT 1 FROM dbo.TblWhatsAppWorkspaceReset rr WHERE rr.BusinessID=ct.BusinessID) OR EXISTS(SELECT 1 FROM dbo.TblConversation c JOIN dbo.VwPrivacyCurrentMessage v ON v.BusinessID=c.BusinessID AND v.ConversationID=c.ConversationID WHERE c.BusinessID=ct.BusinessID AND c.ContactID=ct.ContactID))) Contacts,
 (SELECT COUNT(*) FROM dbo.TblMessage m JOIN dbo.VwPrivacyCurrentMessage v ON v.BusinessID=m.BusinessID AND v.MessageID=m.MessageID WHERE m.BusinessID=@businessId AND ${wa("m")}) Messages`,scope(businessId));
 const s=r.recordset[0];const revision=await getWorkspaceResetRevision(businessId);return {conversations:Number(s?.Conversations??0),contacts:Number(s?.Contacts??0),messages:Number(s?.Messages??0),revision,cleanup:revision?await getResetCleanupStatus(businessId):null};
}
export async function resetWhatsAppWorkspace(businessId:string){
 const id=randomUUID();
 await withTransaction(async trx=>{
  const params=[...scope(businessId),{name:"resetId",type:sql.UniqueIdentifier,value:id}];
  await trx.execute(`
  DECLARE @now datetime2=SYSUTCDATETIME();
  MERGE dbo.TblWhatsAppWorkspaceReset WITH(HOLDLOCK) AS t USING(SELECT @businessId AS BusinessID) s ON t.BusinessID=s.BusinessID
  WHEN MATCHED THEN UPDATE SET ResetAtUtc=@now,ResetID=@resetId
  WHEN NOT MATCHED THEN INSERT(BusinessID,ResetAtUtc,ResetID) VALUES(@businessId,@now,@resetId);
  UPDATE dbo.TblChannelConnection SET WhatsAppHistoryImportEnabled=0,UpdatedAtUtc=@now WHERE BusinessID=@businessId AND Channel=N'WHATSAPP';
  -- Preserve existing operating mode and approval lists, but fence old AI jobs.
  MERGE dbo.TblWhatsAppPrivacyMode WITH(HOLDLOCK) AS t USING(SELECT @businessId AS BusinessID) s ON t.BusinessID=s.BusinessID
  WHEN MATCHED THEN UPDATE SET UpdatedAtUtc=@now
  WHEN NOT MATCHED THEN INSERT(BusinessID,Mode,UpdatedAtUtc) VALUES(@businessId,'ALL',@now);
  UPDATE ct SET DisplayName=NULL,UpdatedAtUtc=@now FROM dbo.TblContact ct WHERE ct.BusinessID=@businessId AND ${wa("ct")};
  UPDATE c SET LastMessageAtUtc=NULL,LastInboundAtUtc=NULL,LastOutboundAtUtc=NULL,LastReadAtUtc=NULL,IsArchived=0,IsPinned=0,UpdatedAtUtc=@now
   FROM dbo.TblConversation c WHERE c.BusinessID=@businessId AND ${wa("c")};
  UPDATE j SET Status=N'SKIPPED',LastErrorCode=N'WORKSPACE_RESET',CompletedAtUtc=@now,UpdatedAtUtc=@now
   FROM dbo.TblAiReplyJob j WHERE j.BusinessID=@businessId AND ${wa("j")} AND j.Status=N'PENDING';
  UPDATE e SET Status=N'RESOLVED',ResolvedAtUtc=@now,FollowUpPhase=N'RESOLVED',ResolutionSource=N'MANUAL_CONFIRMED',
   NotificationStatus=CASE WHEN NotificationStatus=N'PENDING' THEN N'CANCELLED' ELSE NotificationStatus END,CustomerHoldNextAtUtc=NULL,CustomerHoldClaimedAtUtc=NULL,UpdatedAtUtc=@now
   FROM dbo.TblHumanEscalation e WHERE e.BusinessID=@businessId AND ${wa("e")} AND e.ResolvedAtUtc IS NULL AND e.Status IN(N'OPEN',N'ACKNOWLEDGED');
  UPDATE l SET IsActive=0,UpdatedAtUtc=@now FROM dbo.TblWhatsAppContactLabel l WHERE l.BusinessID=@businessId AND ${wa("l")};
  UPDATE l SET IsDeleted=1,LabelName=NULL,Color=NULL,UpdatedAtUtc=@now FROM dbo.TblWhatsAppLabel l WHERE l.BusinessID=@businessId AND ${wa("l")};
  `,params);
 });
 return {revision:await getWorkspaceResetRevision(businessId),cleanup:await getResetCleanupStatus(businessId)};
}
