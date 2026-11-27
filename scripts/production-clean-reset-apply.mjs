// One-time operator-approved production reset. Separate from rollback-only rehearsal.
import sql from "mssql";
import { createHash } from "node:crypto";
import { writeFile, stat } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
const KEEP="C9413A3E-DC87-4A70-BC6E-D00D76F9066B";
const KEEP_SUB="8E00FB21-5601-42B4-A515-687A686E40CE";
const EXPECTED=new Set(("C6CA2952-A589-4FE7-B1DF-00AD2CF48A26 E6E35B6E-A29B-4F8D-8F81-165B2ECB4745 2B67E216-C89A-47C2-88C6-18C93E598B61 19947908-C1EC-4214-9F0D-295B0FB7D56E C3E28109-57BA-4A6D-917D-32B9908C2AD8 404DE82E-3FC7-443F-A030-32E1A0308C09 5B5CC146-7BEF-44B7-AB3B-3E9953AD0C5E 68882ED9-63F1-4EBC-9910-44ECAC55AC3F C5E80812-31FD-4982-838E-513D92CA3B51 19853A3D-B77C-4AB0-B85F-515D9F7DA97E 423BB629-F2C6-454C-A78B-5B4A82D6AF55 B92FFFE5-0E7C-431A-9BBA-6F0F2E06E6A9 2E8DECFD-6D33-4F4A-B437-80EE6777E112 62F29E20-F45D-4C9C-86BE-8866DD4B9135 974C81E0-F1A6-4C19-901C-90A24D9AB057 9B058712-72EB-4ABF-9034-959F41A0E7D0 BE5D33C1-6214-45CD-B92B-9ECB33B39792 AD283779-E01C-44D3-9D9C-AA1C42F8FFAE 745DBF21-7A80-40E1-9A75-B47483C038A7 11BA8038-A56C-441B-9778-C6EBE48F9825 EF53F916-8F4F-49F1-97F3-D2D2806EB556 F908A546-D277-4B72-8FD2-E70E7938DB10 646714CC-6C08-4A5B-B7F9-E89842F29A71 F6041D64-15AA-46A6-85FA-E8D78EB58389 17E1F1C3-0829-47E4-832A-F6555152B457 D9D816CE-1E5C-421D-B9CF-F82C776648DF").split(" "));
const financial=new Set(("TblBillingCustomerRefundRequest TblBillingInvoice TblBillingReceipt TblBillingRefund TblBillingScheduledChange TblManualPaymentRequest TblPricingAddonEntitlement TblPricingAddonInvoice TblPricingAddonOrder TblPricingAddonReceipt TblPricingAddonReplyAllocation TblPricingCreditEvent TblPricingCreditWallet TblPricingFreeTrial TblUsageEvent TblUsagePeriodCounter TblUsageReservation TblAiProviderUsage TblSaasFinancialOutbox TblSaasFinancialReconciliationFinding TblSaasFinancialReconciliationObservation TblSaasFinancialReconciliationEvent TblSaasFinancialReconciliationCase TblSaasFinancialReconciliationRun").split(" "));
const config={server:process.env.DB_SERVER,port:Number(process.env.DB_PORT),database:process.env.DB_NAME,user:process.env.DB_USER,password:process.env.DB_PASSWORD,options:{encrypt:process.env.DB_ENCRYPT!=="false",trustServerCertificate:process.env.DB_TRUST_SERVER_CERTIFICATE==="true"},requestTimeout:60000};
if(process.argv.length!==3||process.argv[2]!=="--apply-permanent-reset-keep-cut-no-backup"||process.env.DRVO_RESET_APPLY_MAINTENANCE!=="true")throw Error("EXPLICIT_APPLY_AND_MAINTENANCE_REQUIRED");
if(config.database?.toUpperCase()!=="DRVOWA")throw Error("WRONG_DATABASE");
const manifestDir=process.env.DRVO_RESET_MANIFEST_DIR;
if(!manifestDir||!isAbsolute(manifestDir))throw Error("PRIVATE_MANIFEST_DIRECTORY_REQUIRED");
const manifestStat=await stat(manifestDir);
if(!manifestStat.isDirectory()||manifestStat.uid!==0||(manifestStat.mode&0o077)!==0)throw Error("PRIVATE_ROOT_OWNED_MANIFEST_DIRECTORY_REQUIRED");
const pool=await new sql.ConnectionPool(config).connect();
const trx=new sql.Transaction(pool);
let begun=false;
const q=async text=>(await trx.request().input("keep",sql.UniqueIdentifier,KEEP).input("keepSub",sql.UniqueIdentifier,KEEP_SUB).query(text)).recordset;
const id=n=>"["+String(n).replaceAll("]","]]")+"]";
const emit=(label,value)=>console.log(label+" "+JSON.stringify(value));
try{
 const backup=(await pool.request().query("SELECT TOP(1) backup_finish_date Finished FROM msdb.dbo.backupset WHERE database_name=DB_NAME() AND type='D' AND is_damaged=0 AND has_backup_checksums=1 AND backup_finish_date>=DATEADD(hour,-2,GETDATE()) ORDER BY backup_finish_date DESC")).recordset[0];
 if(!backup){
  console.warn("WARNING: permanent deletion explicitly authorized without a recent verified backup; no recovery guarantee.");
 }
 try {
  const log=(await pool.request().query("SELECT total_log_size_in_bytes,used_log_space_in_bytes,used_log_space_in_percent FROM sys.dm_db_log_space_usage")).recordset[0];
  emit("TRANSACTION_LOG_BEFORE",log);
 } catch(error) {
  if(![229,297,300].includes(Number(error?.number)))throw error;
  console.warn("TRANSACTION_LOG_METRICS_UNAVAILABLE: existing SQL permissions retained; check filesystem free space separately");
 }
 await trx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);begun=true;
 await q("SET XACT_ABORT ON; SET LOCK_TIMEOUT 10000;");
 const businesses=await q("SELECT BusinessID,Name,Status FROM dbo.TblBusiness ORDER BY Name");
 const actual=businesses.filter(b=>b.BusinessID.toUpperCase()!==KEEP);
 if(actual.length!==EXPECTED.size||actual.some(b=>!EXPECTED.has(b.BusinessID.toUpperCase()))||!businesses.some(b=>b.BusinessID.toUpperCase()===KEEP&&b.Name==="Cut Salon"&&b.Status==="ACTIVE"))throw Error("BUSINESS_SCOPE_CHANGED");
 const sub=await q("SELECT s.SubscriptionID,s.Status,p.Code FROM dbo.TblSubscription s JOIN dbo.TblPlan p ON p.PlanID=s.PlanID WHERE s.BusinessID=@keep AND s.Status='ACTIVE'");
 if(sub.length!==1||sub[0].SubscriptionID.toUpperCase()!==KEEP_SUB||sub[0].Code!=="PRIVATE_UNLIMITED")throw Error("CUT_UNLIMITED_NOT_VERIFIED");
 emit("PROTECTED",{business:KEEP,subscription:KEEP_SUB,plan:sub[0].Code,otherBusinesses:actual.length});
 const columns=await q("SELECT s.name SchemaName,t.name TableName,c.name ColumnName FROM sys.tables t JOIN sys.schemas s ON s.schema_id=t.schema_id JOIN sys.columns c ON c.object_id=t.object_id WHERE s.name='dbo' ORDER BY t.name,c.column_id");
 const tables=new Map();for(const c of columns){if(!tables.has(c.TableName))tables.set(c.TableName,new Set());tables.get(c.TableName).add(c.ColumnName);}
 const fks=await q("SELECT fk.name FkName,OBJECT_NAME(fk.parent_object_id) ChildTable,OBJECT_NAME(fk.referenced_object_id) ParentTable,pc.name ChildColumn,rc.name ParentColumn,fkc.constraint_column_id Ordinal FROM sys.foreign_keys fk JOIN sys.foreign_key_columns fkc ON fk.object_id=fkc.constraint_object_id JOIN sys.columns pc ON pc.object_id=fkc.parent_object_id AND pc.column_id=fkc.parent_column_id JOIN sys.columns rc ON rc.object_id=fkc.referenced_object_id AND rc.column_id=fkc.referenced_column_id ORDER BY fk.name,fkc.constraint_column_id");
 const related=new Map();
 for(const row of fks){if(!related.has(row.FkName))related.set(row.FkName,[]);related.get(row.FkName).push(row);}
 const preserve=new Set(["TblUser","TblPlatformAdmin","TblPlan","TblSchemaMigration","TblPasswordResetToken","TblPricingDiscountCode","TblAiWorkerLiveness"]);
 const rules=new Map();
 for(const [name,cols] of tables){
  if(preserve.has(name))continue;
  if(financial.has(name))rules.set(name,{reason:"DRVO financial/usage reset (external reconciliation review required)",where:"1=1"});
  else if(name==="TblSubscription")rules.set(name,{reason:"retain exact active Unlimited subscription",where:"t.SubscriptionID<>@keepSub"});
  else if(name==="TblSession")rules.set(name,{reason:"remove sessions selecting deleted businesses",where:"t.ActiveBusinessID IS NOT NULL AND t.ActiveBusinessID<>@keep"});
  else if(cols.has("BusinessID"))rules.set(name,{reason:"other business only",where:"t.BusinessID<>@keep"});
 }
 // Known child tables without BusinessID follow the actual FK to their tenant parent.
 const children=new Map([["TblKnowledgeIngestProposal","TblKnowledgeIngestSession"],["TblWhatsAppCampaignPreflightRecipient","TblWhatsAppCampaignPreflight"],["TblWhatsAppCampaignRunItem","TblWhatsAppCampaignRun"],["TblWhatsAppCampaignThrottle","TblChannelConnection"]]);
 for(const [child,parent] of children){
  if(!tables.has(child)||rules.has(child))continue;
  const links=[...related.values()].filter(rows=>rows[0].ChildTable===child&&rows[0].ParentTable===parent);
  if(links.length!==1||!tables.get(parent)?.has("BusinessID"))throw Error("UNRESOLVED_CHILD:"+child);
  rules.set(child,{reason:"other business via verified FK",where:"EXISTS(SELECT 1 FROM dbo."+id(parent)+" p WHERE p.BusinessID<>@keep AND "+links[0].map(x=>"p."+id(x.ParentColumn)+"=t."+id(x.ChildColumn)).join(" AND ")+")"});
 }
 const plan=[];const unclassified=[];
 for(const name of [...tables.keys()].sort()){
  const rule=rules.get(name);
  const result=(await q("SELECT (SELECT COUNT_BIG(*) FROM dbo."+id(name)+" t) Total"+(rule?",(SELECT COUNT_BIG(*) FROM dbo."+id(name)+" t WHERE "+rule.where+") Target":"")))[0];
  const total=Number(result.Total),target=Number(result.Target??0);
  if(rule)plan.push({table:name,total,target,retained:total-target,reason:rule.reason});
  else if(!preserve.has(name)&&total)unclassified.push({table:name,total});
 }
 const hash=createHash("sha256").update(JSON.stringify(plan.map(x=>[x.table,x.reason]))).digest("hex");
 if(hash!=="c423874f8ded8743e398d93d05352ddafb2be4996ccf5e99078afd3a05db5700")throw Error("SCHEMA_PLAN_CHANGED");
 if(unclassified.length)throw Error("UNCLASSIFIED_NONEMPTY_TABLES");
 const knownDeleteGuards=new Map([
 ["TR_TblSaasFinancialOutbox_NoDelete","TblSaasFinancialOutbox"],
 ["TR_SaasFinancialReconciliationRun_NoDelete","TblSaasFinancialReconciliationRun"],
 ["TR_SaasFinancialReconciliationEvent_NoDelete","TblSaasFinancialReconciliationEvent"],
 ["TR_SaasFinancialReconciliationObservation_NoDelete","TblSaasFinancialReconciliationObservation"],
 ["TR_SaasFinancialReconciliationCase_NoDelete","TblSaasFinancialReconciliationCase"],
 ["TR_SaasFinancialReconciliationFinding_NoDelete","TblSaasFinancialReconciliationFinding"]
 ]);
 const knownUpdateGuards=new Map([
 ["TR_TblSaasFinancialOutbox_ImmutableFacts","TblSaasFinancialOutbox"],
 ["TR_SaasFinancialReconciliationEvent_ImmutableFacts","TblSaasFinancialReconciliationEvent"]
 ]);
 const triggers=await q("SELECT OBJECT_NAME(t.parent_id) TableName,t.name TriggerName,t.is_disabled Disabled,e.type_desc EventType FROM sys.triggers t JOIN sys.trigger_events e ON e.object_id=t.object_id WHERE t.parent_class=1");
 const relevant=triggers.filter(x=>rules.has(x.TableName));
 const unexpected=relevant.filter(x=>x.Disabled||!(knownDeleteGuards.get(x.TriggerName)===x.TableName&&x.EventType==="DELETE"||knownUpdateGuards.get(x.TriggerName)===x.TableName&&x.EventType==="UPDATE"));
 if(unexpected.length||relevant.length!==knownDeleteGuards.size+knownUpdateGuards.size){emit("BLOCKING_TRIGGERS",relevant);throw Error("UNEXPECTED_TRIGGER_LAYOUT");}
 if(process.env.DRVO_RESET_APPLY_MAINTENANCE!=="true")throw Error("MAINTENANCE_WINDOW_REQUIRED");
 const perms=await q("SELECT IS_SRVROLEMEMBER('sysadmin') AS IsSysadmin");
 if(Number(perms[0]?.IsSysadmin)!==1)throw Error("RUN_APPLY_WITH_TEMPORARY_SQL_ADMIN_CREDENTIAL");
 // Only reviewed DELETE guards, inside this single transaction.
 // UPDATE immutability guards remain enabled throughout.
 for(const [trigger,table] of knownDeleteGuards){
  await q("DISABLE TRIGGER dbo."+id(trigger)+" ON dbo."+id(table)+";");
 }
 emit("TEMPORARY_APPLY_GUARDS", [...knownDeleteGuards.keys()]);
 // Migration 022 explicitly declares this one trusted ON DELETE CASCADE.
 const unsafeFk=await q("SELECT name,is_disabled,is_not_trusted,delete_referential_action_desc,update_referential_action_desc FROM sys.foreign_keys WHERE is_disabled=1 OR is_not_trusted=1 OR update_referential_action<>0 OR (delete_referential_action<>0 AND NOT (name='FK_TblIntegrationPairing_Business' AND parent_object_id=OBJECT_ID('dbo.TblIntegrationPairing') AND referenced_object_id=OBJECT_ID('dbo.TblBusiness') AND delete_referential_action=1))");
 const pairing=await q("SELECT COUNT(*) AS Matches FROM sys.foreign_key_columns f JOIN sys.foreign_keys k ON k.object_id=f.constraint_object_id JOIN sys.columns pc ON pc.object_id=f.parent_object_id AND pc.column_id=f.parent_column_id JOIN sys.columns rc ON rc.object_id=f.referenced_object_id AND rc.column_id=f.referenced_column_id WHERE k.name='FK_TblIntegrationPairing_Business' AND pc.name='BusinessID' AND rc.name='BusinessID'");
 if(Number(pairing[0]?.Matches)!==1||!rules.has("TblIntegrationPairing"))throw Error("PAIRING_FK_SCOPE_CHANGED");
 if(unsafeFk.length){emit("BLOCKING_FKS",unsafeFk);throw Error("FK_TRUST_OR_CASCADE_REVIEW_REQUIRED");}
 const external=await q("SELECT DeliveryState,EventType,COUNT(*) AS [Rows] FROM dbo.TblSaasFinancialOutbox GROUP BY DeliveryState,EventType");
 if(external.some(x=>x.DeliveryState!=="ACCEPTED"))throw Error("UNSETTLED_FINANCIAL_OUTBOX");
 emit("EXTERNAL_OUTBOX",external);
 // Private identifiers only, for later targeted runtime/media cleanup and legacy
 // hub reconciliation. No message text, secrets, phone numbers or auth state.
 const media=await q("SELECT DISTINCT m.MediaStorageKey FROM dbo.TblMessage m WHERE m.BusinessID<>@keep AND m.MediaStorageKey IS NOT NULL AND NOT EXISTS(SELECT 1 FROM dbo.TblMessage k WHERE k.BusinessID=@keep AND k.MediaStorageKey=m.MediaStorageKey)");
 const runtime=await q("SELECT DISTINCT ExternalAccountKey,RuntimeEngine FROM dbo.TblChannelConnection WHERE BusinessID<>@keep AND Channel='WHATSAPP' AND ExternalAccountKey IS NOT NULL AND NOT EXISTS(SELECT 1 FROM dbo.TblChannelConnection k WHERE k.BusinessID=@keep AND k.ExternalAccountKey=TblChannelConnection.ExternalAccountKey)");
 const hub=await q("SELECT SourceKey,EventID FROM dbo.TblSaasFinancialOutbox");
 const manifest=join(manifestDir,"reset-"+new Date().toISOString().replaceAll(":","-")+".json");
 await writeFile(manifest,JSON.stringify({scope:"DRVOWA",protectedBusiness:KEEP,protectedSubscription:KEEP_SUB,mediaKeys:media.map(x=>x.MediaStorageKey),runtimeAccounts:runtime,externalEvents:hub},null,2),{mode:0o600,flag:"wx"});
 emit("PRIVATE_CLEANUP_MANIFEST",{path:manifest,media:media.length,runtimeAccounts:runtime.length,externalEvents:hub.length});
 // All planned tables, including zero-target tables, are ordered child before parent.
 const remaining=new Set(rules.keys()),ordered=[];
 while(remaining.size){
  const leaves=[...remaining].filter(parent=>!fks.some(x=>x.ParentTable===parent&&x.ChildTable!==parent&&remaining.has(x.ChildTable)));
  if(!leaves.length)throw Error("CYCLIC_FK_GRAPH");
  for(const leaf of leaves.sort()){remaining.delete(leaf);ordered.push(leaf);}
 }
 const expected=new Map(plan.map(x=>[x.table,x]));
 // Counts captured under serializable transaction. No FK disabling or TRUNCATE.
 for(const name of ordered){
  const rule=rules.get(name),row=expected.get(name);
  if(name==="TblBusiness"){const childrenLeft=await q("SELECT COUNT(*) AS Remaining FROM dbo.TblIntegrationPairing WHERE BusinessID<>@keep");if(Number(childrenLeft[0]?.Remaining)!==0)throw Error("PAIRING_CHILDREN_REMAIN");}
  if(!row.target)continue;
  const result=await q("DELETE t FROM dbo."+id(name)+" t WHERE "+rule.where+"; SELECT @@ROWCOUNT AS Deleted;");
  if(Number(result[0]?.Deleted)!==row.target)throw Error("DELETE_COUNT_MISMATCH:"+name);
  emit("APPLY_DELETE",{table:name,rows:row.target});
 }
 for(const row of plan){
  const after=await q("SELECT COUNT_BIG(*) AS Total FROM dbo."+id(row.table));
  if(Number(after[0].Total)!==row.retained)throw Error("POST_COUNT_MISMATCH:"+row.table);
 }
 const keep=await q("SELECT b.Name,s.Status,p.Code FROM dbo.TblBusiness b JOIN dbo.TblSubscription s ON s.BusinessID=b.BusinessID JOIN dbo.TblPlan p ON p.PlanID=s.PlanID WHERE b.BusinessID=@keep AND s.SubscriptionID=@keepSub");
 if(keep.length!==1||keep[0].Name!=="Cut Salon"||keep[0].Status!=="ACTIVE"||keep[0].Code!=="PRIVATE_UNLIMITED")throw Error("PROTECTED_SUBSCRIPTION_INVALID");
 const channel=await q("SELECT RuntimeEngine,Status FROM dbo.TblChannelConnection WHERE BusinessID=@keep");
 if(channel.length!==1||channel[0].RuntimeEngine!=="BAILEYS_V7"||channel[0].Status!=="ACTIVE")throw Error("PROTECTED_CHANNEL_INVALID");
 emit("PROTECTED_BEFORE_COMMIT",await q("SELECT (SELECT COUNT(*) FROM dbo.TblBusiness) Businesses,(SELECT COUNT(*) FROM dbo.TblSubscription) Subscriptions,(SELECT COUNT(*) FROM dbo.TblMessage WHERE BusinessID=@keep) Messages,(SELECT COUNT(*) FROM dbo.TblContact WHERE BusinessID=@keep) Contacts,(SELECT COUNT(*) FROM dbo.TblKnowledgeItem WHERE BusinessID=@keep) KnowledgeItems,(SELECT COUNT(*) FROM dbo.TblErpInvoiceMirror WHERE BusinessID=@keep) ERPInvoices"));
 for(const [trigger,table] of knownDeleteGuards){
  await q("ENABLE TRIGGER dbo."+id(trigger)+" ON dbo."+id(table)+";");
 }
 const disabled=await q("SELECT name FROM sys.triggers WHERE is_disabled=1 AND parent_class=1");
 if(disabled.some(x=>knownDeleteGuards.has(x.name)))throw Error("GUARD_RESTORE_FAILED");
 await trx.commit();begun=false;
 console.log("PRODUCTION_CLEAN_RESET_COMMITTED");
 const restored=(await pool.request().query("SELECT name,is_disabled FROM sys.triggers WHERE parent_class=1")).recordset;
 for(const [trigger] of knownDeleteGuards)if(!restored.some(x=>x.name===trigger&&!x.is_disabled))throw Error("POST_COMMIT_GUARD_VERIFICATION_FAILED");
 const verification=(await pool.request().query("SELECT (SELECT COUNT(*) FROM dbo.TblBusiness) Businesses,(SELECT COUNT(*) FROM dbo.TblSubscription) Subscriptions,(SELECT COUNT(*) FROM dbo.TblManualPaymentRequest) PaymentRequests,(SELECT COUNT(*) FROM dbo.TblBillingInvoice) Invoices,(SELECT COUNT(*) FROM dbo.TblSaasFinancialOutbox) Outbox")).recordset[0];
 if(verification.Businesses!==1||verification.Subscriptions!==1||verification.PaymentRequests!==0||verification.Invoices!==0||verification.Outbox!==0)throw Error("POST_COMMIT_VERIFICATION_FAILED");
 emit("FINAL_VERIFICATION",verification);
 console.log("PRODUCTION_CLEAN_RESET_VERIFIED");
}finally{if(begun){try{await trx.rollback();}catch{}}await pool.close();}
