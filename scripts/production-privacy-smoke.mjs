// Production-only, synthetic tenant smoke. No real account, no WhatsApp send.
import sql from "mssql";
import {randomUUID,randomBytes,createHash} from "node:crypto";
import {lstat,realpath,writeFile,unlink} from "node:fs/promises";
import {join} from "node:path";
if(process.argv.length!==3||process.argv[2]!=="--synthetic-only"||process.env.DB_NAME?.toUpperCase()!=="DRVOWA")throw Error("EXPLICIT_PRODUCTION_SMOKE_REQUIRED");
const root="/home/drvowa/app/data/whatsapp-media";
if(await realpath(root)!==root||!(await lstat(root)).isDirectory())throw Error("MEDIA_ROOT");
const ids=Object.fromEntries(["biz","user","session","channel","contact","conv","old","fresh"].map(x=>[x,randomUUID()]));
const slug="privacy-smoke-"+ids.biz,phone="12025550123",token=randomBytes(32).toString("base64url"),hash=x=>createHash("sha256").update(x).digest("hex"),key=hash(ids.channel+":"+ids.old),file=join(root,key);
const pool=await new sql.ConnectionPool({server:process.env.DB_SERVER,port:Number(process.env.DB_PORT),database:process.env.DB_NAME,user:process.env.DB_USER,password:process.env.DB_PASSWORD,options:{encrypt:process.env.DB_ENCRYPT!=="false",trustServerCertificate:process.env.DB_TRUST_SERVER_CERTIFICATE==="true"},requestTimeout:60000}).connect();
function req(conn){const r=conn.request();for(const [k,v] of Object.entries(ids))r.input(k,sql.UniqueIdentifier,v);return r.input("slug",sql.NVarChar(100),slug).input("phone",sql.NVarChar(32),phone).input("external",sql.NVarChar(256),phone+"@s.whatsapp.net").input("tokenhash",sql.NVarChar(128),hash(token)).input("email",sql.NVarChar(320),ids.user+"@example.invalid").input("media",sql.NVarChar(128),key).input("providerOld",sql.NVarChar(256),ids.old).input("providerFresh",sql.NVarChar(256),ids.fresh);}
const q=async(s,conn=pool)=>(await req(conn).query(s)).recordset;
const must=(ok,label)=>{if(!ok)throw Error(label);console.log("PASS",label);};
const api=async(path,method="GET",body,auth=true,expected=200)=>{
 const headers={Accept:"application/json","Content-Type":"application/json"};
 if(auth)headers.Cookie="drvowa_session="+token;
 const res=await fetch("http://127.0.0.1:3100/api/channels/whatsapp/privacy/"+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body),redirect:"error",signal:AbortSignal.timeout(15000)});
 if(res.status!==expected)throw Error("HTTP_"+method+"_"+path+"_"+res.status+"_EXPECTED_"+expected);
 if(expected===200&&!/no-store/i.test(res.headers.get("cache-control")||""))throw Error("PRIVACY_CACHE_HEADER_"+path);
 return res.json();
};
const ident=n=>"["+String(n).replaceAll("]","]]")+"]";
let seeded=false,createdFile=false,passed=false;
console.log("SYNTHETIC_BUSINESS_ID",ids.biz);
async function atomic(fn){const t=new sql.Transaction(pool);let active=false;try{await t.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);active=true;await fn(t);await t.commit();active=false;}finally{if(active)try{await t.rollback();}catch{}}}
try{
 const before=await q("SELECT (SELECT COUNT(*) FROM dbo.TblBusiness WHERE BusinessID='C9413A3E-DC87-4A70-BC6E-D00D76F9066B') Cut,(SELECT COUNT(*) FROM dbo.TblWhatsAppWorkspaceReset WHERE BusinessID='C9413A3E-DC87-4A70-BC6E-D00D76F9066B') CutReset,(SELECT COUNT(*) FROM dbo.TblWhatsAppRetentionPreference WHERE BusinessID='C9413A3E-DC87-4A70-BC6E-D00D76F9066B' AND AutomaticEnabledAtUtc IS NOT NULL) CutRetention");
 must(before[0].Cut===1,"CUT_PRESENT");
 for(const path of ["mode","contacts","inventory?days=90","reset","retention"])await api(path,"GET",undefined,false,401);
 must(true,"ANONYMOUS_PRIVACY_DENIED");
 await writeFile(file,"synthetic privacy attachment",{flag:"wx",mode:0o600});createdFile=true;
 await atomic(async t=>{await q(`
 INSERT INTO dbo.TblUser(UserID,Email,PasswordHash,FullName,Status) VALUES(@user,@email,N'INVALID_TEST_PASSWORD_HASH',N'Privacy smoke',N'ACTIVE');
 INSERT INTO dbo.TblBusiness(BusinessID,Name,Slug,Category,CountryCode,Locale,Timezone,Status,OnboardingCompletedAtUtc) VALUES(@biz,N'Privacy smoke temporary',@slug,N'salon',N'EG',N'ar-EG',N'Africa/Cairo',N'ACTIVE',SYSUTCDATETIME());
 INSERT INTO dbo.TblBusinessMember(BusinessID,UserID,Role,Status) VALUES(@biz,@user,N'OWNER',N'ACTIVE');
 INSERT INTO dbo.TblSession(SessionID,UserID,TokenHash,ActiveBusinessID,ExpiresAtUtc) VALUES(@session,@user,@tokenhash,@biz,DATEADD(minute,10,SYSUTCDATETIME()));
 INSERT INTO dbo.TblChannelConnection(ChannelConnectionID,BusinessID,Channel,Provider,Status,IsActive,RuntimeEngine) VALUES(@channel,@biz,N'WHATSAPP',N'BAILEYS',N'DISCONNECTED',0,N'BAILEYS_V7');
 INSERT INTO dbo.TblContact(ContactID,BusinessID,ChannelConnectionID,ExternalContactKey,PhoneNormalized) VALUES(@contact,@biz,@channel,@external,@phone);
 INSERT INTO dbo.TblConversation(ConversationID,BusinessID,ChannelConnectionID,ContactID) VALUES(@conv,@biz,@channel,@contact);
 INSERT INTO dbo.TblMessage(MessageID,BusinessID,ConversationID,ChannelConnectionID,ContactID,Direction,Provider,ProviderMessageID,ContentType,TextContent,MediaStorageKey,ReceivedAtUtc,CreatedAtUtc) VALUES(@old,@biz,@conv,@channel,@contact,N'INBOUND',N'baileys',@providerOld,N'TEXT',N'synthetic old message',@media,SYSUTCDATETIME(),SYSUTCDATETIME());
 `,t);});seeded=true;
 must((await api("inventory?days=90")).messages===1,"OWNER_INVENTORY");
 must((await api("retention")).available===true,"RETENTION_AVAILABLE");
 await q("UPDATE dbo.TblBusinessMember SET Role='MEMBER' WHERE BusinessID=@biz AND UserID=@user");
 for(const path of ["mode","contacts","inventory?days=90","reset","retention"])await api(path,"GET",undefined,true,403);
 await api("reset","POST",{confirmation:"مسح الكل"},true,403);
 await q("UPDATE dbo.TblBusinessMember SET Role='OWNER' WHERE BusinessID=@biz AND UserID=@user");
 must(true,"MEMBER_PRIVACY_DENIED");
 must((await api("contacts","POST",{phone})).phones.includes(phone),"PRIVATE_CONTACT_ADD");
 must((await api("inventory?days=90")).hiddenMessages===1,"PRIVATE_CONTACT_HIDES_MESSAGE");
 must(!(await api("contacts","DELETE",{phone})).phones.includes(phone),"PRIVATE_CONTACT_REMOVE");
 must((await api("mode","POST",{action:"mode",mode:"MANUAL"})).mode==="MANUAL","MANUAL_MODE");
 must((await api("mode","POST",{action:"approve",phone})).approved.includes(phone),"APPROVE_CONTACT");
 must(!(await api("mode","POST",{action:"revoke",phone})).approved.includes(phone),"REVOKE_CONTACT");
 must((await api("mode","POST",{action:"mode",mode:"ALL"})).mode==="ALL","RESTORE_ALL_MODE");
 await api("retention","POST",{days:30,automatic:true},true,400);
 must((await api("retention","POST",{days:30,automatic:false})).automatic===false,"RETENTION_EXPLICIT_CONSENT_REQUIRED");
 must((await api("retention","POST",{days:30,automatic:true,confirmation:"DELETE_EXPIRED_CONTENT"})).automatic===true,"RETENTION_OWNER_OPT_IN");
 // Retention is tested for consent only; recent fixture is not retention-eligible.
 await api("retention","POST",{days:null,automatic:false});
 const existing=(await q("SELECT PrivacyPurgedAtUtc FROM dbo.TblMessage WHERE BusinessID=@biz AND MessageID=@old"))[0];
 if(existing.PrivacyPurgedAtUtc)throw Error("RECENT_FIXTURE_UNEXPECTEDLY_PURGED");
 await api("reset","POST",{confirmation:"wrong"},true,400);
 must((await api("reset")).messages===1,"RESET_PREVIEW_AND_CONFIRMATION");
 await api("reset","POST",{confirmation:"مسح الكل"});
 must((await api("reset")).messages===0,"RESET_HIDES_OLD_CONTENT");
 // Ensure timestamps are strictly after the reset revision.
 await new Promise(r=>setTimeout(r,100));
 await q("INSERT INTO dbo.TblMessage(MessageID,BusinessID,ConversationID,ChannelConnectionID,ContactID,Direction,Provider,ProviderMessageID,ContentType,TextContent,ReceivedAtUtc,ProviderTimestampUtc) VALUES(@fresh,@biz,@conv,@channel,@contact,N'INBOUND',N'baileys',@providerFresh,N'TEXT',N'synthetic new message',SYSUTCDATETIME(),SYSUTCDATETIME())");
 let done=false;
 for(let i=0;i<25;i++){
  const rows=await q("SELECT MessageID,TextContent,MediaStorageKey,PrivacyPurgedAtUtc FROM dbo.TblMessage WHERE BusinessID=@biz AND MessageID IN(@old,@fresh)");
  const old=rows.find(x=>x.MessageID.toLowerCase()===ids.old),fresh=rows.find(x=>x.MessageID.toLowerCase()===ids.fresh);
  if(!fresh||fresh.TextContent!=="synthetic new message"||fresh.PrivacyPurgedAtUtc)throw Error("NEW_CONTENT_UNEXPECTEDLY_CHANGED");
  let missing=false;try{await lstat(file);}catch(e){if(e.code==="ENOENT")missing=true;else throw e;}
  if(old?.PrivacyPurgedAtUtc&&old.TextContent===null&&old.MediaStorageKey===null&&missing){done=true;break;}
  await new Promise(r=>setTimeout(r,3000));
 }
 must(done,"LIVE_WORKER_PURGED_CONTENT_AND_FILE");
 must((await api("reset")).messages===1,"POST_RESET_NEW_MESSAGE_VISIBLE");
 const after=await q("SELECT (SELECT COUNT(*) FROM dbo.TblBusiness WHERE BusinessID='C9413A3E-DC87-4A70-BC6E-D00D76F9066B') Cut,(SELECT COUNT(*) FROM dbo.TblWhatsAppWorkspaceReset WHERE BusinessID='C9413A3E-DC87-4A70-BC6E-D00D76F9066B') CutReset,(SELECT COUNT(*) FROM dbo.TblWhatsAppRetentionPreference WHERE BusinessID='C9413A3E-DC87-4A70-BC6E-D00D76F9066B' AND AutomaticEnabledAtUtc IS NOT NULL) CutRetention");
 must(JSON.stringify(before)===JSON.stringify(after),"CUT_PRIVACY_SETTINGS_UNCHANGED");
 passed=true;
}finally{
 try{
  if(seeded)await atomic(async t=>{
   const check=await q("SELECT COUNT(*) N FROM dbo.TblBusiness WHERE BusinessID=@biz AND Slug=@slug AND Name=N'Privacy smoke temporary'",t);
   if(check[0].N!==1)throw Error("SYNTHETIC_SCOPE_CHANGED");
   const columns=await q("SELECT t.name AS TableName FROM sys.tables t JOIN sys.schemas s ON s.schema_id=t.schema_id JOIN sys.columns c ON c.object_id=t.object_id WHERE s.name='dbo' AND c.name='BusinessID'",t);
   const fk=await q("SELECT OBJECT_NAME(parent_object_id) Child,OBJECT_NAME(referenced_object_id) Parent FROM sys.foreign_keys",t);
   const remaining=new Set(columns.map(x=>x.TableName));
   const ordered=[];
   while(remaining.size){const leaves=[...remaining].filter(p=>!fk.some(f=>f.Parent===p&&f.Child!==p&&remaining.has(f.Child)));if(!leaves.length)throw Error("FIXTURE_CLEANUP_FK_CYCLE");for(const x of leaves){remaining.delete(x);ordered.push(x);}}
   await q("DELETE FROM dbo.TblSession WHERE SessionID=@session AND UserID=@user AND ActiveBusinessID=@biz",t);
   for(const name of ordered){
    const n=(await q("SELECT COUNT(*) N FROM dbo."+ident(name)+" WHERE BusinessID=@biz",t))[0].N;
    if(!n)continue;
    if(/Financial|Billing|Payment|Refund|Integration|Subscription|Usage|Pricing/i.test(name))throw Error("UNEXPECTED_FINANCIAL_OR_INTEGRATION_FIXTURE:"+name);
    await q("DELETE FROM dbo."+ident(name)+" WHERE BusinessID=@biz",t);
   }
   await q("DELETE FROM dbo.TblUser WHERE UserID=@user AND Email=@email",t);
  });
  if(createdFile){const refs=await q("SELECT COUNT(*) N FROM dbo.TblMessage WHERE MediaStorageKey=@media");if(refs[0].N===0)try{await unlink(file);}catch(e){if(e.code!=="ENOENT")throw e;}}
  console.log("SYNTHETIC_FIXTURE_CLEANED");
 }finally{await pool.close();}
}
if(passed)console.log("PRODUCTION_PRIVACY_SMOKE_VERIFIED");
