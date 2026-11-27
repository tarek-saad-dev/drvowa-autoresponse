import {sql,type TransactionClient} from "@/lib/db";
// Release automatically on transaction commit/rollback, even on worker crash.
export async function lockPrivacyStorage(trx:TransactionClient,businessId:string){
 const r=await trx.query<{Result:number}>(`DECLARE @result int;
 EXEC @result=sys.sp_getapplock @Resource=@resource,@LockMode='Exclusive',@LockOwner='Transaction',@LockTimeout=5000;
 SELECT @result Result;`,[{name:"resource",type:sql.NVarChar(255),value:"drvo-wa-privacy:"+businessId.toLowerCase()}]);
 if(Number(r.recordset[0]?.Result??-999)<0)throw Error("PRIVACY_STORAGE_LOCK_UNAVAILABLE");
}
