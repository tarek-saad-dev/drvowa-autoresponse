import { randomUUID } from "node:crypto";
import { afterAll,beforeAll,describe,expect,it } from "vitest";
import { closePool,query,sql } from "@/lib/db";
import { changePrivateContact } from "@/modules/messaging/private-contact-service";
import { changeApprovedContact,setPrivacyMode } from "@/modules/messaging/privacy-mode-service";
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
});
