import { randomUUID,createHash } from "node:crypto";
import {mkdtemp,writeFile,readFile,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {drainResetCleanup,getResetCleanupStatus,runNextResetCleanup} from "@/modules/messaging/privacy-purge-service";
import { afterAll,beforeAll,describe,expect,it } from "vitest";
import { closePool,query,sql } from "@/lib/db";
import { changePrivateContact } from "@/modules/messaging/private-contact-service";
import { changeApprovedContact,setPrivacyMode } from "@/modules/messaging/privacy-mode-service";
import { resetWhatsAppWorkspace,previewWorkspaceReset } from "@/modules/messaging/workspace-reset-service";
import { removeInboxContacts } from "@/modules/messaging/conversation-privacy-service";
import { getConversationForBusiness,listMessagesForConversation } from "@/modules/messaging/repository";
const isolated=process.env.DRVO_TEST_ISOLATED_DB==="1"&&/test|isolated/i.test(process.env.DB_NAME??"");
const phone="201001234567";
function fixture(){return {business:randomUUID(),channel:randomUUID(),contact:randomUUID(),conversation:randomUUID(),message:randomUUID()};}
const a=fixture(),b=fixture();
const uuid=(name:string,value:string)=>({name,type:sql.UniqueIdentifier,value});
async function seed(f:ReturnType<typeof fixture>){
 await query(`INSERT INTO dbo.TblBusiness(BusinessID,Name,Slug,Category,CountryCode,Locale,Timezone,Status)
 VALUES(@business,N'Privacy synthetic',@slug,N'salon',N'EG',N'ar-EG',N'Africa/Cairo',N'ACTIVE');
 INSERT INTO dbo.TblChannelConnection(ChannelConnectionID,BusinessID,Channel,Provider,Status,IsActive)
 VALUES(@channel,@business,N'WHATSAPP',N'BAILEYS',N'ACTIVE',1);
 INSERT INTO dbo.TblContact(ContactID,BusinessID,ChannelConnectionID,ExternalContactKey,PhoneNormalized)
 VALUES(@contact,@business,@channel,@external,@phone);
 INSERT INTO dbo.TblConversation(ConversationID,BusinessID,ChannelConnectionID,ContactID)
 VALUES(@conversation,@business,@channel,@contact);
 INSERT INTO dbo.TblMessage(MessageID,BusinessID,ConversationID,ChannelConnectionID,ContactID,Direction,Provider,ProviderMessageID,ContentType,TextContent,ReceivedAtUtc)
 VALUES(@message,@business,@conversation,@channel,@contact,N'INBOUND',N'baileys',@provider,N'TEXT',N'synthetic privacy test',SYSUTCDATETIME());`,
 [...Object.entries(f).map(([name,value])=>uuid(name,value)),{name:"slug",type:sql.NVarChar(100),value:"privacy-"+f.business},{name:"external",type:sql.NVarChar(256),value:phone+"@s.whatsapp.net"},{name:"phone",type:sql.NVarChar(32),value:phone},{name:"provider",type:sql.NVarChar(256),value:"test-"+f.message}]);
}
async function aiEligible(f:ReturnType<typeof fixture>){
 const r=await query("SELECT MessageID FROM dbo.VwPrivacyAiEligibleMessage WHERE BusinessID=@business AND MessageID=@message",[uuid("business",f.business),uuid("message",f.message)]);
 return r.recordset.length===1;
}
async function visible(f:ReturnType<typeof fixture>){return Boolean(await getConversationForBusiness({businessId:f.business,conversationId:f.conversation}));}
describe.runIf(isolated)("WhatsApp privacy SQL",()=>{
 beforeAll(async()=>{await seed(a);await seed(b);},60000);
 afterAll(async()=>{await closePool();});
 it("enforces private exclusion, manual approval watermarks and tenant-scoped tombstones",async()=>{
  expect(await visible(a)).toBe(true);expect(await aiEligible(a)).toBe(true);
  await changePrivateContact(a.business,phone,true);
  expect(await visible(a)).toBe(false);expect(await aiEligible(a)).toBe(false);
  expect(await visible(b)).toBe(true);
  await changePrivateContact(a.business,phone,false);
  await setPrivacyMode(a.business,"MANUAL");
  expect(await visible(a)).toBe(true);expect(await aiEligible(a)).toBe(false);
  await changeApprovedContact(a.business,phone,true);
  expect(await aiEligible(a)).toBe(false);
  // Synthetic next inbound watermark: no real WhatsApp traffic.
  await query("UPDATE dbo.TblMessage SET ReceivedAtUtc=DATEADD(second,1,SYSUTCDATETIME()) WHERE BusinessID=@business AND MessageID=@message",[uuid("business",a.business),uuid("message",a.message)]);
  expect(await aiEligible(a)).toBe(true);
  await changeApprovedContact(a.business,phone,false);
  await setPrivacyMode(a.business,"BUSINESS_ONLY");
  expect(await visible(a)).toBe(false);
  await setPrivacyMode(a.business,"ALL");
  await expect(removeInboxContacts(a.business,[b.conversation])).rejects.toThrow();
  expect(await visible(a)).toBe(true);
  await removeInboxContacts(a.business,[a.conversation]);
  expect(await visible(a)).toBe(false);expect(await visible(b)).toBe(true);
  expect(await listMessagesForConversation({businessId:a.business,conversationId:a.conversation})).toEqual([]);
  expect(await listMessagesForConversation({businessId:b.business,conversationId:b.conversation})).toHaveLength(1);
 });
 it("reset all hides old messages and contacts without blocking the same phone forever",async()=>{
  const c=fixture();await seed(c);
  expect(await previewWorkspaceReset(c.business)).toMatchObject({conversations:1,contacts:1,messages:1});
  await resetWhatsAppWorkspace(c.business);
  expect(await previewWorkspaceReset(c.business)).toMatchObject({conversations:0,contacts:0,messages:0});
  expect(await visible(c)).toBe(false);expect(await visible(b)).toBe(true);
  await query("INSERT INTO dbo.TblMessage(MessageID,BusinessID,ConversationID,ChannelConnectionID,ContactID,Direction,Provider,ProviderMessageID,ContentType,TextContent,ReceivedAtUtc,ProviderTimestampUtc) VALUES(@new,@business,@conversation,@channel,@contact,N'INBOUND',N'baileys',@provider,N'TEXT',N'new synthetic',SYSUTCDATETIME(),DATEADD(second,1,SYSUTCDATETIME()))",[...Object.entries(c).map(([name,value])=>uuid(name,value)),uuid("new",randomUUID()),{name:"provider",type:sql.NVarChar(256),value:"new-"+c.message}]);
  expect(await visible(c)).toBe(true);
  const rows=await listMessagesForConversation({businessId:c.business,conversationId:c.conversation});
  expect(rows.map(m=>m.textContent)).toEqual(["new synthetic"]);
  expect(await aiEligible(c)).toBe(false);
 });
 it("actually clears old content and queued media, while preserving other tenant and new messages",async()=>{
  const d=fixture();await seed(d);
  const root=await mkdtemp(join(tmpdir(),"privacy-synthetic-"));
  const key=createHash("sha256").update(d.message).digest("hex"),file=join(root,key);
  const prior=process.env.DRVO_PRIVACY_OFFLINE_MAINTENANCE;
  try{
   await writeFile(file,"synthetic attachment");
   await query("UPDATE dbo.TblMessage SET MediaStorageKey=@key,MediaFileName=N'synthetic.png' WHERE BusinessID=@business AND MessageID=@message",[uuid("business",d.business),uuid("message",d.message),{name:"key",type:sql.NVarChar(128),value:key}]);
   await resetWhatsAppWorkspace(d.business);
   expect(await getResetCleanupStatus(d.business)).toMatchObject({pendingMessages:1,status:"PENDING"});
   await query("INSERT INTO dbo.TblMessage(MessageID,BusinessID,ConversationID,ChannelConnectionID,ContactID,Direction,Provider,ProviderMessageID,ContentType,TextContent,ReceivedAtUtc,ProviderTimestampUtc) VALUES(@new,@business,@conversation,@channel,@contact,N'INBOUND',N'baileys',@provider,N'TEXT',N'new message',SYSUTCDATETIME(),DATEADD(second,1,SYSUTCDATETIME()))",[...Object.entries(d).map(([name,value])=>uuid(name,value)),uuid("new",randomUUID()),{name:"provider",type:sql.NVarChar(256),value:"new-"+d.message}]);
   process.env.DRVO_PRIVACY_OFFLINE_MAINTENANCE="true";
   const result=await drainResetCleanup(d.business,root,3);
   expect(result).toMatchObject({purged:1,deletedFiles:1,remaining:{pendingMessages:0,pendingFiles:0,status:"CONTENT_CLEANED"}});
   await expect(readFile(file)).rejects.toMatchObject({code:"ENOENT"});
   const old=await query<{TextContent:string|null;MediaStorageKey:string|null;PrivacyPurgedAtUtc:Date|null}>("SELECT TextContent,MediaStorageKey,PrivacyPurgedAtUtc FROM dbo.TblMessage WHERE BusinessID=@business AND MessageID=@message",[uuid("business",d.business),uuid("message",d.message)]);
   expect(old.recordset[0]).toMatchObject({TextContent:null,MediaStorageKey:null});expect(old.recordset[0].PrivacyPurgedAtUtc).toBeTruthy();
   expect(await drainResetCleanup(d.business,root,1)).toMatchObject({purged:0,deletedFiles:0});
   expect(await listMessagesForConversation({businessId:b.business,conversationId:b.conversation})).toHaveLength(1);
   expect((await listMessagesForConversation({businessId:d.business,conversationId:d.conversation})).map(m=>m.textContent)).toEqual(["new message"]);
  }finally{if(prior===undefined)delete process.env.DRVO_PRIVACY_OFFLINE_MAINTENANCE;else process.env.DRVO_PRIVACY_OFFLINE_MAINTENANCE=prior;await rm(root,{recursive:true,force:true});}
 },30000);

 it("automatically cleans a reset tenant, not unreset tenants",async()=>{
  const d=fixture(),unreset=fixture();await seed(d);await seed(unreset);
  const root=await mkdtemp(join(tmpdir(),"privacy-auto-synthetic-"));
  const oldFlag=process.env.DRVO_PRIVACY_RESET_CLEANUP_ENABLED,oldRoot=process.env.DRVO_MEDIA_STORAGE_DIR;
  try{
   process.env.DRVO_PRIVACY_RESET_CLEANUP_ENABLED="false";
   expect(await runNextResetCleanup()).toBeNull();
   await query("UPDATE dbo.TblWhatsAppWorkspaceReset SET CleanupAttemptAtUtc=SYSUTCDATETIME()");
   const key=createHash("sha256").update(d.message).digest("hex");
   await writeFile(join(root,key),"synthetic attachment");
   await query("UPDATE dbo.TblMessage SET MediaStorageKey=@key WHERE BusinessID=@business AND MessageID=@message",[uuid("business",d.business),uuid("message",d.message),{name:"key",type:sql.NVarChar(128),value:key}]);
   await resetWhatsAppWorkspace(d.business);
   process.env.DRVO_PRIVACY_RESET_CLEANUP_ENABLED="true";process.env.DRVO_MEDIA_STORAGE_DIR=root;
   expect(await runNextResetCleanup()).toMatchObject({purged:1,deletedFiles:1});
   expect(await getResetCleanupStatus(d.business)).toMatchObject({pendingMessages:0,pendingFiles:0,status:"CONTENT_CLEANED"});
   await expect(readFile(join(root,key))).rejects.toMatchObject({code:"ENOENT"});
   expect(await listMessagesForConversation({businessId:unreset.business,conversationId:unreset.conversation})).toHaveLength(1);
   expect(await runNextResetCleanup()).toBeNull();
  }finally{
   if(oldFlag===undefined)delete process.env.DRVO_PRIVACY_RESET_CLEANUP_ENABLED;else process.env.DRVO_PRIVACY_RESET_CLEANUP_ENABLED=oldFlag;
   if(oldRoot===undefined)delete process.env.DRVO_MEDIA_STORAGE_DIR;else process.env.DRVO_MEDIA_STORAGE_DIR=oldRoot;
   await rm(root,{recursive:true,force:true});
  }
 },30000);

});
