import { rm } from "node:fs/promises";
import { join,isAbsolute } from "node:path";
import { lockPrivacyStorage } from "./privacy-storage-lock";
import { query,sql,withTransaction } from "@/lib/db";
export const RETENTION_DAYS=[7,30,90,180,365] as const;
export type PurgeTarget={kind:"removed"}|{kind:"reset"}|{kind:"retention";days:number};
const scope=(businessId:string)=>[{name:"businessId",type:sql.UniqueIdentifier,value:businessId}];
function filter(target:PurgeTarget){
 if(target.kind==="removed")return "EXISTS (SELECT 1 FROM dbo.TblWhatsAppRemovedContact r JOIN dbo.TblContact ct ON ct.BusinessID=r.BusinessID AND ct.PhoneNormalized=r.PhoneNormalized WHERE r.BusinessID=m.BusinessID AND ct.ContactID=m.ContactID)";
 if(target.kind==="reset")return "EXISTS (SELECT 1 FROM dbo.TblWhatsAppWorkspaceReset rr WHERE rr.BusinessID=m.BusinessID AND (m.IsHistorical=1 OR m.CreatedAtUtc<rr.ResetAtUtc OR COALESCE(m.ProviderTimestampUtc,m.ReceivedAtUtc)<rr.ResetAtUtc))";
 if(!RETENTION_DAYS.some(d=>d===target.days))throw Error("INVALID_RETENTION_DAYS");
 return "m.CreatedAtUtc<DATEADD(day,-@days,SYSUTCDATETIME())";
}
function parameters(businessId:string,target:PurgeTarget){return [...scope(businessId),{name:"days",type:sql.Int,value:target.kind==="retention"?target.days:0}];}
const base="m.BusinessID=@businessId AND m.PrivacyPurgedAtUtc IS NULL AND EXISTS (SELECT 1 FROM dbo.TblChannelConnection ch WHERE ch.BusinessID=m.BusinessID AND ch.ChannelConnectionID=m.ChannelConnectionID AND ch.Channel=N'WHATSAPP')";
const noActiveJob="NOT EXISTS (SELECT 1 FROM dbo.TblAiReplyJob j WHERE j.BusinessID=m.BusinessID AND j.ConversationID=m.ConversationID AND j.Status NOT IN(N'SENT',N'SKIPPED',N'FAILED',N'COALESCED'))";
export async function previewContentPurge(businessId:string,target:PurgeTarget){
 const result=await query<{Candidates:number;Eligible:number}>(`SELECT (SELECT COUNT(1) FROM dbo.TblMessage m WHERE ${base} AND ${filter(target)}) Candidates, (SELECT COUNT(1) FROM dbo.TblMessage m WHERE ${base} AND ${filter(target)} AND ${noActiveJob}) Eligible`,parameters(businessId,target));
 return {candidates:Number(result.recordset[0]?.Candidates??0),eligible:Number(result.recordset[0]?.Eligible??0)};
}
export async function getResetCleanupStatus(businessId:string){
 const [messages,files]=await Promise.all([
  previewContentPurge(businessId,{kind:"reset"}),
  query<{Pending:number;Deleted:number}>("SELECT COALESCE(SUM(CASE WHEN DeletedAtUtc IS NULL THEN 1 ELSE 0 END),0) Pending, COALESCE(SUM(CASE WHEN DeletedAtUtc IS NOT NULL THEN 1 ELSE 0 END),0) Deleted FROM dbo.TblWhatsAppMediaPurge WHERE BusinessID=@businessId",scope(businessId))
 ]);
 const pendingFiles=Number(files.recordset[0]?.Pending??0);
 return {pendingMessages:messages.candidates,eligibleMessages:messages.eligible,pendingFiles,deletedFiles:Number(files.recordset[0]?.Deleted??0),status:messages.candidates||pendingFiles?"PENDING" as const:"CONTENT_CLEANED" as const};
}
// General retention/removed maintenance remains offline-only.
export async function purgeContentBatch(businessId:string,target:PurgeTarget){
 if(process.env.DRVO_PRIVACY_OFFLINE_MAINTENANCE!=="true")throw Error("OFFLINE_MAINTENANCE_REQUIRED");
 return purgeBatch(businessId,target,false);
}
async function purgeBatch(businessId:string,target:PurgeTarget,online:boolean){
 return withTransaction(async trx=>{
 if(online)await lockPrivacyStorage(trx,businessId);
 const result=await trx.query<{Purged:number}>(`
 DECLARE @ids TABLE(MessageID uniqueidentifier PRIMARY KEY);
 INSERT INTO @ids SELECT TOP(100) m.MessageID FROM dbo.TblMessage m WITH(UPDLOCK,HOLDLOCK)
 WHERE ${base} AND ${filter(target)} AND ${noActiveJob}
 ORDER BY m.CreatedAtUtc,m.MessageID;
 IF EXISTS(SELECT 1 FROM dbo.TblMessage m JOIN @ids i ON i.MessageID=m.MessageID
 WHERE m.MediaStorageKey IS NOT NULL AND (LEN(m.MediaStorageKey)<>64 OR m.MediaStorageKey COLLATE Latin1_General_100_BIN2 LIKE '%[^0-9a-f]%'))
 THROW 51000,'Unexpected media storage key',1;
 INSERT INTO dbo.TblWhatsAppMediaPurge(BusinessID,StorageKey)
 SELECT DISTINCT m.BusinessID,m.MediaStorageKey FROM dbo.TblMessage m JOIN @ids i ON i.MessageID=m.MessageID
 WHERE m.BusinessID=@businessId AND m.MediaStorageKey IS NOT NULL
 AND NOT EXISTS(SELECT 1 FROM dbo.TblWhatsAppMediaPurge q WITH(UPDLOCK,HOLDLOCK) WHERE q.BusinessID=m.BusinessID AND q.StorageKey=m.MediaStorageKey);
 DELETE p FROM dbo.TblPulseAiAssessment p JOIN @ids i ON i.MessageID=p.MessageID WHERE p.BusinessID=@businessId;
 DELETE p FROM dbo.TblPulseSignal p JOIN @ids i ON i.MessageID=p.MessageID WHERE p.BusinessID=@businessId;
 DELETE p FROM dbo.TblPulseMessageScan p JOIN @ids i ON i.MessageID=p.MessageID WHERE p.BusinessID=@businessId;
 UPDATE j SET GeneratedReplyText=NULL FROM dbo.TblAiReplyJob j JOIN @ids i ON i.MessageID=j.TriggerMessageID WHERE j.BusinessID=@businessId;
 UPDATE m SET TextContent=NULL,ContentType=N'UNKNOWN',MediaMimeType=NULL,MediaFileName=NULL,MediaSizeBytes=NULL,MediaStorageKey=NULL,
 QuotedProviderMessageID=NULL,ActorName=NULL,PrivacyPurgedAtUtc=SYSUTCDATETIME()
 FROM dbo.TblMessage m JOIN @ids i ON i.MessageID=m.MessageID WHERE m.BusinessID=@businessId;
 SELECT COUNT(1) Purged FROM @ids;
 `,parameters(businessId,target));
 return Number(result.recordset[0]?.Purged??0);
 });
}
export async function deleteQueuedMedia(businessId:string,root:string){
 if(process.env.DRVO_PRIVACY_OFFLINE_MAINTENANCE!=="true")throw Error("OFFLINE_MAINTENANCE_REQUIRED");
 return deleteMediaBatch(businessId,root,false);
}
async function deleteMediaBatch(businessId:string,root:string,online:boolean){
 return withTransaction(async trx=>{
 if(online)await lockPrivacyStorage(trx,businessId);
 const result=await trx.query<{StorageKey:string}>(`SELECT TOP(100) q.StorageKey FROM dbo.TblWhatsAppMediaPurge q WHERE q.BusinessID=@businessId AND q.DeletedAtUtc IS NULL
 AND NOT EXISTS(SELECT 1 FROM dbo.TblMessage m WHERE m.MediaStorageKey=q.StorageKey) ORDER BY q.QueuedAtUtc`,scope(businessId));
 let deleted=0;
 for(const row of result.recordset){
  if(!/^[0-9a-f]{64}$/.test(row.StorageKey))throw Error("INVALID_MEDIA_KEY");
  await rm(join(root,row.StorageKey),{force:true});
  await trx.query("UPDATE dbo.TblWhatsAppMediaPurge SET DeletedAtUtc=SYSUTCDATETIME() WHERE BusinessID=@businessId AND StorageKey=@key AND DeletedAtUtc IS NULL",[...scope(businessId),{name:"key",type:sql.VarChar(64),value:row.StorageKey}]);
  deleted++;
 }
 return deleted;
 });
}
// Bound each maintenance run; a subsequent invocation safely resumes.
export async function drainResetCleanup(businessId:string,root:string,maxBatches=100){
 if(process.env.DRVO_PRIVACY_OFFLINE_MAINTENANCE!=="true")throw Error("OFFLINE_MAINTENANCE_REQUIRED");
 if(!Number.isInteger(maxBatches)||maxBatches<1||maxBatches>100)throw Error("INVALID_BATCH_LIMIT");
 let purged=0,deletedFiles=0,batches=0;
 for(;batches<maxBatches;batches++){
  const n=await purgeContentBatch(businessId,{kind:"reset"});
  const files=await deleteQueuedMedia(businessId,root);
  purged+=n;deletedFiles+=files;
  if(!n&&!files){batches++;break;}
 }
 return {purged,deletedFiles,batches,remaining:await getResetCleanupStatus(businessId)};
}
// Only worker invokes this; never automatically purges general retention.
export async function runNextResetCleanup(){
 if(process.env.DRVO_PRIVACY_RESET_CLEANUP_ENABLED!=="true")return null;
 const root=process.env.DRVO_MEDIA_STORAGE_DIR;
 if(!root||!isAbsolute(root))throw Error("EXPLICIT_ABSOLUTE_MEDIA_DIRECTORY_REQUIRED");
 const next=await query<{BusinessID:string}>(`SELECT TOP(1) rr.BusinessID FROM dbo.TblWhatsAppWorkspaceReset rr
 WHERE (rr.CleanupAttemptAtUtc IS NULL OR rr.CleanupAttemptAtUtc<DATEADD(second,-30,SYSUTCDATETIME()))
 AND (EXISTS(SELECT 1 FROM dbo.TblMessage m WHERE m.BusinessID=rr.BusinessID AND m.PrivacyPurgedAtUtc IS NULL
 AND EXISTS(SELECT 1 FROM dbo.TblChannelConnection ch WHERE ch.BusinessID=m.BusinessID AND ch.ChannelConnectionID=m.ChannelConnectionID AND ch.Channel=N'WHATSAPP')
 AND (m.IsHistorical=1 OR m.CreatedAtUtc<rr.ResetAtUtc OR COALESCE(m.ProviderTimestampUtc,m.ReceivedAtUtc)<rr.ResetAtUtc))
 OR EXISTS(SELECT 1 FROM dbo.TblWhatsAppMediaPurge q WHERE q.BusinessID=rr.BusinessID AND q.DeletedAtUtc IS NULL))
 ORDER BY rr.CleanupAttemptAtUtc,rr.ResetAtUtc,rr.BusinessID`);
 const businessId=next.recordset[0]?.BusinessID;if(!businessId)return null;
 await query("UPDATE dbo.TblWhatsAppWorkspaceReset SET CleanupAttemptAtUtc=SYSUTCDATETIME() WHERE BusinessID=@businessId",scope(businessId));
 const purged=await purgeBatch(businessId,{kind:"reset"},true);
 const deletedFiles=await deleteMediaBatch(businessId,root,true);
 return {purged,deletedFiles};
}
export async function getRetentionPreference(businessId:string){
 const r=await query<{RetentionDays:number|null}>("SELECT RetentionDays FROM dbo.TblWhatsAppRetentionPreference WHERE BusinessID=@businessId",scope(businessId));
 return r.recordset[0]?.RetentionDays??null;
}
export async function saveRetentionPreference(businessId:string,days:number|null){
 if(days!==null&&!RETENTION_DAYS.some(d=>d===days))throw Error("INVALID_RETENTION_DAYS");
 await query("MERGE dbo.TblWhatsAppRetentionPreference WITH(HOLDLOCK) AS t USING(SELECT @businessId AS BusinessID) s ON t.BusinessID=s.BusinessID WHEN MATCHED THEN UPDATE SET RetentionDays=@days,UpdatedAtUtc=SYSUTCDATETIME() WHEN NOT MATCHED THEN INSERT(BusinessID,RetentionDays) VALUES(@businessId,@days);",[...scope(businessId),{name:"days",type:sql.Int,value:days}]);
 return days;
}
