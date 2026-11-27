// Remove only unreferenced users and known stopped experimental runtime auth directories.
import sql from "mssql";
import {readFile,lstat,realpath,rm} from "node:fs/promises";
import {resolve,join,dirname} from "node:path";
import {execFileSync} from "node:child_process";
const KEEP="C9413A3E-DC87-4A70-BC6E-D00D76F9066B",SUB="8E00FB21-5601-42B4-A515-687A686E40CE";
const NEW_BIZ="97289032-1A80-4507-97B6-3808A247BE25",NEW_SUB="D38C41BC-95C2-420F-B3D9-126A1FF57448";
const manifest="/root/drvowa-reset-manifests/reset-2026-11-27T19-27-20.215Z.json";
if(process.getuid()!==0||process.argv[2]!=="--apply-users-and-stopped-auth"||process.argv.length!==3||process.env.DB_NAME?.toUpperCase()!=="DRVOWA")throw Error("EXPLICIT_ROOT_APPLY_REQUIRED");
const st=await lstat(manifest);if(!st.isFile()||st.uid!==0||(st.mode&0o077))throw Error("MANIFEST_PERMISSIONS");
const m=JSON.parse(await readFile(manifest,"utf8"));
if(m.scope!=="DRVOWA"||m.protectedBusiness!==KEEP||m.protectedSubscription!==SUB||m.runtimeAccounts.length!==6)throw Error("MANIFEST_SCOPE");
const keys=[...new Set(m.runtimeAccounts.map(x=>x.ExternalAccountKey))];
if(keys.length!==6||keys.some(x=>typeof x!=="string"||!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(x)))throw Error("INVALID_RUNTIME_KEYS");
const cfg={server:process.env.DB_SERVER,port:Number(process.env.DB_PORT),database:process.env.DB_NAME,user:process.env.DB_USER,password:process.env.DB_PASSWORD,options:{encrypt:process.env.DB_ENCRYPT!=="false",trustServerCertificate:process.env.DB_TRUST_SERVER_CERTIFICATE==="true"},requestTimeout:60000};
const pool=await new sql.ConnectionPool(cfg).connect();
const q=async(s)=>(await pool.request().input("keep",sql.UniqueIdentifier,KEEP).input("sub",sql.UniqueIdentifier,SUB).query(s)).recordset;
const base=process.env.WHATSAPP_RUNTIME_BASE_URL?.trim()?.replace(/\/+$/,""),token=process.env.DRVOWA_RUNTIME_TOKEN?.trim();
if(!base||!token)throw Error("RUNTIME_CONFIG");
const status=async key=>{
 const r=await fetch(base+"/api/accounts/"+encodeURIComponent(key)+"/status",{headers:{Authorization:"Bearer "+token,Accept:"application/json"},redirect:"error",signal:AbortSignal.timeout(15000)});
 const b=await r.json();if(!r.ok||!b.success||!b.status)throw Error("RUNTIME_STATUS_HTTP_"+r.status);return b.status;
};
const system=(...args)=>execFileSync("systemctl",args,{encoding:"utf8"}).trim();
const ident=n=>"["+String(n).replaceAll("]","]]")+"]";
let botStopped=false;
try{
 const scope=await q("SELECT (SELECT COUNT(*) FROM dbo.TblBusiness) Businesses,(SELECT COUNT(*) FROM dbo.TblSubscription) Subscriptions,(SELECT COUNT(*) FROM dbo.TblSubscription s JOIN dbo.TblPlan p ON p.PlanID=s.PlanID WHERE s.BusinessID=@keep AND s.SubscriptionID=@sub AND s.Status='ACTIVE' AND p.Code='PRIVATE_UNLIMITED') ProtectedSubscription");
 const newBiz=await q("SELECT b.BusinessID,b.Name,b.OnboardingCompletedAtUtc,s.SubscriptionID,p.Code AS PlanCode,s.Status FROM dbo.TblBusiness b JOIN dbo.TblSubscription s ON s.BusinessID=b.BusinessID JOIN dbo.TblPlan p ON p.PlanID=s.PlanID WHERE b.BusinessID<>@keep");
 const validNew=newBiz.length===1&&newBiz[0].BusinessID.toUpperCase()===NEW_BIZ&&newBiz[0].Name==="DrvoTech"&&newBiz[0].SubscriptionID.toUpperCase()===NEW_SUB&&newBiz[0].PlanCode==="FREE"&&newBiz[0].Status==="ACTIVE";
 if(scope[0].Businesses!==2||scope[0].Subscriptions!==2||scope[0].ProtectedSubscription!==1||!validNew)throw Error("RESET_SCOPE_CHANGED");
 console.log("NEW_WORKSPACE_PRESERVED",JSON.stringify({name:newBiz[0].Name,plan:newBiz[0].PlanCode,onboardingCompleted:Boolean(newBiz[0].OnboardingCompletedAtUtc)}));
 const audit=await q("SELECT Action,COUNT(*) AS N FROM dbo.TblAuditEvent WHERE BusinessID='97289032-1A80-4507-97B6-3808A247BE25' GROUP BY Action");
 console.log("NEW_WORKSPACE_AUDIT_ACTIONS",JSON.stringify(audit));
 const collision=await q("SELECT ExternalAccountKey FROM dbo.TblChannelConnection WHERE ExternalAccountKey IS NOT NULL");
 if(collision.some(row=>keys.some(k=>k.toLowerCase()===row.ExternalAccountKey.toLowerCase())))throw Error("LIVE_RUNTIME_KEY_COLLISION");
 const ch=await q("SELECT ExternalAccountKey FROM dbo.TblChannelConnection WHERE BusinessID=@keep AND Channel='WHATSAPP' AND RuntimeEngine='BAILEYS_V7' AND Status='ACTIVE'");
 if(ch.length!==1||!ch[0].ExternalAccountKey||keys.some(k=>k.toLowerCase()===ch[0].ExternalAccountKey.toLowerCase()))throw Error("CUT_RUNTIME_SCOPE");
 const cut=ch[0].ExternalAccountKey;
 const cutStatus=await status(cut);if(!cutStatus.ready)throw Error("CUT_NOT_READY");
 for(const key of keys){const a=await status(key);if(a.state!=="STOPPED"||a.ready!==false)throw Error("EXPERIMENTAL_RUNTIME_NOT_STOPPED");}
 const pid=Number(system("show","whatsapp-bot.service","-p","MainPID","--value"));
 if(!Number.isInteger(pid)||pid<2)throw Error("BOT_PID");
 const cwd=await realpath("/proc/"+pid+"/cwd");
 const procEnv=Object.fromEntries((await readFile("/proc/"+pid+"/environ","utf8")).split("\0").filter(x=>x.includes("=")).map(x=>[x.slice(0,x.indexOf("=")),x.slice(x.indexOf("=")+1)]));
 const v6=resolve(cwd,procEnv.DRVOWA_BAILEYS_AUTH_ACCOUNTS_DIR||"data/baileys-auth-accounts");
 const v7=resolve(cwd,procEnv.DRVOWA_BAILEYS_AUTH_ACCOUNTS_V7_DIR?.trim()||join(dirname(v6),"baileys-auth-accounts-v7"));
 if(typeof cutStatus.authDir!=="string"||resolve(cutStatus.authDir)!==join(v7,cut)||await realpath(join(v7,cut))!==join(v7,cut))throw Error("CUT_AUTH_ROOT_NOT_VERIFIED");
 for(const key of keys){const a=await status(key);const expected=join(a.runtimeEngine==="BAILEYS_V7"?v7:v6,key);if(typeof a.authDir!=="string"||resolve(a.authDir)!==expected)throw Error("EXPERIMENTAL_AUTH_ROOT_NOT_VERIFIED");}
 const registry=resolve(cwd,procEnv.DRVOWA_MANAGED_REGISTRY_FILE?.trim()||join(v6,"runtime-registry.json"));
 if(v6===v7||v6==="/"||v7==="/"||v6.startsWith(v7+"/")||v7.startsWith(v6+"/"))throw Error("AUTH_ROOT_OVERLAP");
 const readRegistry=async()=>{
  if(await realpath(registry)!==registry||!(await lstat(registry)).isFile())throw Error("REGISTRY_PATH");
  const doc=JSON.parse(await readFile(registry,"utf8"));
  if(doc.version!==1||doc.accounts?.[cut]?.desiredState!=="RUNNING"||keys.some(k=>doc.accounts?.[k]?.desiredState!=="STOPPED"))throw Error("REGISTRY_NOT_PERSISTED");
  return doc;
 };
 await readRegistry();
 // Retain STOPPED registry entries as tombstones. Never touch CUT or any
 // unknown account directories, and stop the service before deleting auth.
 system("stop","whatsapp-bot.service");botStopped=true;
 if(system("show","whatsapp-bot.service","-p","MainPID","--value")!=="0")throw Error("BOT_NOT_STOPPED");
 await readRegistry();
 let authRemoved=0,authMissing=0;
 for(const root of [v6,v7]){
  let rootInfo;try{rootInfo=await lstat(root);}catch(e){if(e.code==="ENOENT"){authMissing+=keys.length;continue;}throw e;}
  if(!rootInfo.isDirectory()||rootInfo.isSymbolicLink()||await realpath(root)!==root)throw Error("UNSAFE_AUTH_ROOT");
  for(const key of keys){
   const dir=join(root,key);
   let d;try{d=await lstat(dir);}catch(e){if(e.code==="ENOENT"){authMissing++;continue;}throw e;}
   if(!d.isDirectory()||d.isSymbolicLink()||await realpath(dir)!==dir)throw Error("UNSAFE_AUTH_DIR");
   await rm(dir,{recursive:true,force:false});authRemoved++;
  }
 }
 console.log("EXPERIMENTAL_AUTH_CLEANUP",JSON.stringify({removedDirectories:authRemoved,missingDirectories:authMissing}));
 system("start","whatsapp-bot.service");botStopped=false;
 // Preserve every user referenced by remaining business data, settings,
 // platform admin records or any FK; only disposable session/reset-token
 // references may be removed with otherwise unreferenced users.
 const tx=new sql.Transaction(pool);let active=false;
 const tq=async s=>(await tx.request().input("keep",sql.UniqueIdentifier,KEEP).query(s)).recordset;
 try{
  await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);active=true;
  await tq("SET XACT_ABORT ON; SET LOCK_TIMEOUT 10000;");
  const check=await tq("SELECT COUNT(*) AS N FROM dbo.TblBusiness");
  if(check[0].N!==2)throw Error("BUSINESSES_CHANGED");
  const refs=await tq("SELECT DISTINCT s.name SchemaName,t.name TableName,c.name ColumnName FROM sys.tables t JOIN sys.schemas s ON s.schema_id=t.schema_id JOIN sys.columns c ON c.object_id=t.object_id WHERE t.object_id<>OBJECT_ID('dbo.TblUser') AND (c.name LIKE '%UserID' OR EXISTS(SELECT 1 FROM sys.foreign_key_columns f WHERE f.parent_object_id=t.object_id AND f.parent_column_id=c.column_id AND f.referenced_object_id=OBJECT_ID('dbo.TblUser'))) AND c.system_type_id=36");
  const excluded=new Set(["TblSession","TblPasswordResetToken"]);
  const keepRefs=refs.filter(x=>!(x.SchemaName==="dbo"&&excluded.has(x.TableName)));
  if(!keepRefs.some(x=>x.TableName==="TblPlatformAdmin")||!keepRefs.some(x=>x.TableName==="TblBusinessMember"))throw Error("USER_REFERENCE_SCOPE");
  const predicates=keepRefs.map(x=>"NOT EXISTS(SELECT 1 FROM "+ident(x.SchemaName)+"."+ident(x.TableName)+" r WHERE r."+ident(x.ColumnName)+"=u.UserID)");
  // One SQL batch: a temp table created in a parameterized request may not
  // survive another request. Protect post-reset signups and referenced users.
  const result=await tq("DECLARE @orphan TABLE(UserID uniqueidentifier PRIMARY KEY); INSERT INTO @orphan SELECT u.UserID FROM dbo.TblUser u WHERE u.CreatedAtUtc < CONVERT(datetime2,'2026-11-27T19:27:20.215',126) AND "+predicates.join(" AND ")+"; DECLARE @total int=(SELECT COUNT(*) FROM dbo.TblUser), @target int=(SELECT COUNT(*) FROM @orphan), @admins int=(SELECT COUNT(*) FROM dbo.TblPlatformAdmin); IF @admins<1 OR @target>=@total THROW 51000,'USER_PROTECTION',1; DELETE t FROM dbo.TblPasswordResetToken t JOIN @orphan x ON x.UserID=t.UserID; DELETE t FROM dbo.TblSession t JOIN @orphan x ON x.UserID=t.UserID; DELETE u FROM dbo.TblUser u JOIN @orphan x ON x.UserID=u.UserID; IF (SELECT COUNT(*) FROM dbo.TblUser)<>@total-@target OR (SELECT COUNT(*) FROM dbo.TblPlatformAdmin)<>@admins OR NOT EXISTS(SELECT 1 FROM dbo.TblBusinessMember WHERE BusinessID=@keep) THROW 51000,'USER_POSTCHECK_FAILED',1; SELECT @target AS Removed,(SELECT COUNT(*) FROM dbo.TblUser) Users,@admins AS Admins,(SELECT COUNT(*) FROM dbo.TblBusinessMember WHERE BusinessID=@keep) CutMembers;");
  const after=result;
  await tx.commit();active=false;
  console.log("USERS_CLEANUP",JSON.stringify(after[0]));
 }finally{if(active){try{await tx.rollback();}catch{}}}
 let final=null;
 for(let i=0;i<10;i++){try{final=await status(cut);if(final.ready)break;}catch{} await new Promise(r=>setTimeout(r,3000));}
 console.log("CUT_RUNTIME_FINAL",JSON.stringify({state:final?.state??"UNKNOWN",ready:final?.ready===true,runtimeEngine:final?.runtimeEngine}));
 if(!final?.ready)throw Error("CUT_RUNTIME_RECOVERY_NOT_VERIFIED");
 console.log("USERS_AND_STOPPED_AUTH_CLEANUP_VERIFIED");
}finally{if(botStopped){try{system("start","whatsapp-bot.service");}catch{console.error("BOT_RESTART_REQUIRED");}}await pool.close();}
