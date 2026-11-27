// Read-only production cleanup inventory; never executes writes or changes services.
import sql from "mssql";
import { createHash } from "node:crypto";
const KEEP="C9413A3E-DC87-4A70-BC6E-D00D76F9066B";
const KEEP_SUB="8E00FB21-5601-42B4-A515-687A686E40CE";
const EXPECTED=new Set(("C6CA2952-A589-4FE7-B1DF-00AD2CF48A26 E6E35B6E-A29B-4F8D-8F81-165B2ECB4745 2B67E216-C89A-47C2-88C6-18C93E598B61 19947908-C1EC-4214-9F0D-295B0FB7D56E C3E28109-57BA-4A6D-917D-32B9908C2AD8 404DE82E-3FC7-443F-A030-32E1A0308C09 5B5CC146-7BEF-44B7-AB3B-3E9953AD0C5E 68882ED9-63F1-4EBC-9910-44ECAC55AC3F C5E80812-31FD-4982-838E-513D92CA3B51 19853A3D-B77C-4AB0-B85F-515D9F7DA97E 423BB629-F2C6-454C-A78B-5B4A82D6AF55 B92FFFE5-0E7C-431A-9BBA-6F0F2E06E6A9 2E8DECFD-6D33-4F4A-B437-80EE6777E112 62F29E20-F45D-4C9C-86BE-8866DD4B9135 974C81E0-F1A6-4C19-901C-90A24D9AB057 9B058712-72EB-4ABF-9034-959F41A0E7D0 BE5D33C1-6214-45CD-B92B-9ECB33B39792 AD283779-E01C-44D3-9D9C-AA1C42F8FFAE 745DBF21-7A80-40E1-9A75-B47483C038A7 11BA8038-A56C-441B-9778-C6EBE48F9825 EF53F916-8F4F-49F1-97F3-D2D2806EB556 F908A546-D277-4B72-8FD2-E70E7938DB10 646714CC-6C08-4A5B-B7F9-E89842F29A71 F6041D64-15AA-46A6-85FA-E8D78EB58389 17E1F1C3-0829-47E4-832A-F6555152B457 D9D816CE-1E5C-421D-B9CF-F82C776648DF").split(" "));
const financial=new Set(("TblBillingCustomerRefundRequest TblBillingInvoice TblBillingReceipt TblBillingRefund TblBillingScheduledChange TblManualPaymentRequest TblPricingAddonEntitlement TblPricingAddonInvoice TblPricingAddonOrder TblPricingAddonReceipt TblPricingAddonReplyAllocation TblPricingCreditEvent TblPricingCreditWallet TblPricingFreeTrial TblUsageEvent TblUsagePeriodCounter TblUsageReservation TblAiProviderUsage TblSaasFinancialOutbox TblSaasFinancialReconciliationFinding TblSaasFinancialReconciliationObservation TblSaasFinancialReconciliationEvent TblSaasFinancialReconciliationCase TblSaasFinancialReconciliationRun").split(" "));
const config={server:process.env.DB_SERVER,port:Number(process.env.DB_PORT),database:process.env.DB_NAME,user:process.env.DB_USER,password:process.env.DB_PASSWORD,options:{encrypt:process.env.DB_ENCRYPT!=="false",trustServerCertificate:process.env.DB_TRUST_SERVER_CERTIFICATE==="true"},requestTimeout:60000};
const pool=await new sql.ConnectionPool(config).connect();
const q=async text=>(await pool.request().input("keep",sql.UniqueIdentifier,KEEP).input("keepSub",sql.UniqueIdentifier,KEEP_SUB).query(text)).recordset;
const id=n=>"["+String(n).replaceAll("]","]]")+"]";
const emit=(label,value)=>console.log(label+" "+JSON.stringify(value));
try{
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
 emit("DELETE_PREVIEW",plan.filter(x=>x.target));
 emit("UNCHANGED_OR_EMPTY",plan.filter(x=>!x.target).map(x=>x.table));
 emit("UNCLASSIFIED_NONEMPTY",unclassified);
 emit("EXTERNAL_OUTBOX",await q("SELECT DeliveryState,EventType,COUNT(*) AS [Rows] FROM dbo.TblSaasFinancialOutbox GROUP BY DeliveryState,EventType"));
 emit("EXTERNAL_RECONCILIATION",await q("SELECT SourceKey,COUNT(*) AS [Rows] FROM dbo.TblSaasFinancialReconciliationEvent GROUP BY SourceKey"));
 emit("CUT_PROTECTED_COUNTS",await q("SELECT (SELECT COUNT(*) FROM dbo.TblMessage WHERE BusinessID=@keep) Messages,(SELECT COUNT(*) FROM dbo.TblContact WHERE BusinessID=@keep) Contacts,(SELECT COUNT(*) FROM dbo.TblIntegration WHERE BusinessID=@keep) Integrations,(SELECT COUNT(*) FROM dbo.TblKnowledgeItem WHERE BusinessID=@keep) KnowledgeItems,(SELECT COUNT(*) FROM dbo.TblErpInvoiceMirror WHERE BusinessID=@keep) ERPInvoices"));
 emit("CUT_CHANNEL",await q("SELECT RuntimeEngine,Status,COUNT(*) AS [Rows] FROM dbo.TblChannelConnection WHERE BusinessID=@keep GROUP BY RuntimeEngine,Status"));
 emit("MEDIA_KEYS",await q("SELECT CASE WHEN BusinessID=@keep THEN 'KEEP' ELSE 'OTHER' END Scope,COUNT(DISTINCT MediaStorageKey) AS Files FROM dbo.TblMessage WHERE MediaStorageKey IS NOT NULL GROUP BY CASE WHEN BusinessID=@keep THEN 'KEEP' ELSE 'OTHER' END"));
 emit("FK_COLUMNS",fks);
 try{emit("BACKUP_METADATA",await q("SELECT TOP(1) backup_finish_date Finished,is_damaged Damaged,backup_size Bytes FROM msdb.dbo.backupset WHERE database_name=DB_NAME() AND type='D' ORDER BY backup_finish_date DESC"));}catch{emit("BACKUP_METADATA","permission unavailable; operator must verify new backup");}
 emit("PLAN_HASH",createHash("sha256").update(JSON.stringify(plan.map(x=>[x.table,x.reason]))).digest("hex"));
 console.log("PREVIEW_ONLY_NO_WRITES");
}finally{await pool.close();}
