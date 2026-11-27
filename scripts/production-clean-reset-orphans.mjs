// Follow-up to the committed one-time production reset. Never delete runtime auth files here.
import sql from "mssql";
import {readFile,lstat,realpath,unlink} from "node:fs/promises";
import {join,resolve} from "node:path";
const KEEP="C9413A3E-DC87-4A70-BC6E-D00D76F9066B",SUB="8E00FB21-5601-42B4-A515-687A686E40CE";
const path="/root/drvowa-reset-manifests/reset-2026-11-27T19-27-20.215Z.json";
if(process.argv.length!==3||process.argv[2]!=="--apply-orphan-cleanup")throw Error("EXPLICIT_APPLY_REQUIRED");
const info=await lstat(path);
if(!info.isFile()||info.uid!==0||(info.mode&0o077))throw Error("MANIFEST_PERMISSIONS");
const m=JSON.parse(await readFile(path,"utf8"));
if(m.scope!=="DRVOWA"||m.protectedBusiness!==KEEP||m.protectedSubscription!==SUB||m.mediaKeys.length!==92||m.runtimeAccounts.length!==6||m.externalEvents.length!==4)throw Error("MANIFEST_SCOPE");
if(m.mediaKeys.some(x=>typeof x!=="string"||!/^[0-9a-f]{64}$/.test(x)))throw Error("INVALID_MEDIA_KEY");
const accounts=[...new Set(m.runtimeAccounts.map(x=>x.ExternalAccountKey))];
if(accounts.some(x=>typeof x!=="string"||!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(x)))throw Error("INVALID_ACCOUNT_KEY");
if(process.env.DB_NAME?.toUpperCase()!=="DRVOWA")throw Error("WRONG_DB");
const root=resolve(process.env.DRVO_MEDIA_STORAGE_DIR||join(process.cwd(),"data","whatsapp-media"));
if(root!=="/home/drvowa/app/data/whatsapp-media"||await realpath(root)!==root||!(await lstat(root)).isDirectory())throw Error("MEDIA_ROOT_MISMATCH");
const base=process.env.WHATSAPP_RUNTIME_BASE_URL?.trim()?.replace(/\/+$/,""),token=process.env.DRVOWA_RUNTIME_TOKEN?.trim();
if(!base||!token)throw Error("RUNTIME_CONFIG_MISSING");
const api=async(key,method,action)=>{
 const res=await fetch(base+"/api/accounts/"+encodeURIComponent(key)+"/"+action,{method,headers:{Authorization:"Bearer "+token,Accept:"application/json"},redirect:"error",signal:AbortSignal.timeout(30000)});
 const body=await res.json();
 if(!res.ok||body.success!==true||!body.status)throw Error("RUNTIME_"+action.toUpperCase()+"_FAILED_HTTP_"+res.status);
 return body.status;
};
const pool=await new sql.ConnectionPool({server:process.env.DB_SERVER,port:Number(process.env.DB_PORT),database:process.env.DB_NAME,user:process.env.DB_USER,password:process.env.DB_PASSWORD,options:{encrypt:process.env.DB_ENCRYPT!=="false",trustServerCertificate:process.env.DB_TRUST_SERVER_CERTIFICATE==="true"},requestTimeout:60000}).connect();
const q=async (s)=>(await pool.request().input("keep",sql.UniqueIdentifier,KEEP).input("sub",sql.UniqueIdentifier,SUB).query(s)).recordset;
try{
 const scope=await q("SELECT (SELECT COUNT(*) FROM dbo.TblBusiness) Businesses,(SELECT COUNT(*) FROM dbo.TblSubscription) Subscriptions,(SELECT COUNT(*) FROM dbo.TblSubscription s JOIN dbo.TblPlan p ON p.PlanID=s.PlanID WHERE s.BusinessID=@keep AND s.SubscriptionID=@sub AND s.Status='ACTIVE' AND p.Code='PRIVATE_UNLIMITED') ProtectedSubscription");
 if(scope[0].Businesses!==1||scope[0].Subscriptions!==1||scope[0].ProtectedSubscription!==1)throw Error("POST_RESET_SCOPE_CHANGED");
 const channels=await q("SELECT ExternalAccountKey,RuntimeEngine,Status FROM dbo.TblChannelConnection WHERE BusinessID=@keep AND Channel='WHATSAPP'");
 if(channels.length!==1||channels[0].RuntimeEngine!=="BAILEYS_V7"||channels[0].Status!=="ACTIVE"||!channels[0].ExternalAccountKey||accounts.includes(channels[0].ExternalAccountKey))throw Error("CUT_RUNTIME_PROTECTION");
 const protectedKey=channels[0].ExternalAccountKey;
 const before=await api(protectedKey,"GET","status");
 console.log("CUT_RUNTIME_BEFORE",JSON.stringify({state:before.state,ready:before.ready,runtimeEngine:before.runtimeEngine}));
 let stopped=0;
 for(const key of accounts){await api(key,"POST","stop");const status=await api(key,"GET","status");if(status.state!=="STOPPED"||status.ready!==false)throw Error("EXPERIMENTAL_ACCOUNT_NOT_STOPPED");stopped++;}
 console.log("EXPERIMENTAL_RUNTIMES_STOPPED",stopped);
 let removed=0,missing=0,referenced=0;
 for(const key of new Set(m.mediaKeys)){
  const refs=(await pool.request().input("key",sql.NVarChar(64),key).query("SELECT COUNT_BIG(*) AS Refs FROM dbo.TblMessage WHERE MediaStorageKey=@key")).recordset;
  if(Number(refs[0].Refs)!==0){referenced++;continue;}
  const file=join(root,key);
  let st;try{st=await lstat(file);}catch(e){if(e.code==="ENOENT"){missing++;continue;}throw e;}
  if(!st.isFile()||st.isSymbolicLink()||st.nlink!==1)throw Error("UNEXPECTED_MEDIA_FILE_TYPE");
  await unlink(file);removed++;
 }
 console.log("MEDIA_CLEANUP",JSON.stringify({removed,alreadyMissing:missing,stillReferenced:referenced}));
 const after=await api(protectedKey,"GET","status");
 console.log("CUT_RUNTIME_AFTER",JSON.stringify({state:after.state,ready:after.ready,runtimeEngine:after.runtimeEngine}));
 console.log("DRVO_POST_CLEANUP",JSON.stringify((await q("SELECT (SELECT COUNT(*) FROM dbo.TblBusiness) Businesses,(SELECT COUNT(*) FROM dbo.TblUser) Users,(SELECT COUNT(*) FROM dbo.TblMessage WHERE BusinessID=@keep) CutMessages,(SELECT COUNT(*) FROM dbo.TblContact WHERE BusinessID=@keep) CutContacts,(SELECT COUNT(*) FROM dbo.TblManualPaymentRequest) PaymentRequests,(SELECT COUNT(*) FROM dbo.TblBillingInvoice) Invoices"))[0]));
 console.log("ORPHAN_MEDIA_AND_RUNTIME_STOP_COMPLETED");
}finally{await pool.close();}
