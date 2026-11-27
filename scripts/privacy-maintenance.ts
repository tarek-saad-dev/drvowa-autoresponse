import { isAbsolute } from "node:path";
import { closePool } from "../src/lib/db";
import { previewContentPurge,purgeContentBatch,deleteQueuedMedia,getRetentionPreference,type PurgeTarget } from "../src/modules/messaging/privacy-purge-service";
async function main(){
 const args=process.argv.slice(2);
 const businessId=args[0];
 if(!businessId||! /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(businessId)||!["removed","retention","reset"].includes(args[1])||args.slice(2).some(a=>a!=="--apply"))throw Error("Usage: privacy:maintain BUSINESS_UUID removed|retention|reset [--apply]");
 let target:PurgeTarget=args[1]==="reset"?{kind:"reset"}:{kind:"removed"};
 if(args[1]==="retention"){
  const days=await getRetentionPreference(businessId);
  if(days===null)throw Error("NO_RETENTION_PREFERENCE");
  target={kind:"retention",days};
 }
 const preview=await previewContentPurge(businessId,target);
 console.log(JSON.stringify({mode:"preview",...preview}));
 if(!args.includes("--apply"))return;
 if(process.env.DRVO_PRIVACY_OFFLINE_MAINTENANCE!=="true")throw Error("STOP_ALL_WRITERS_AND_SET_OFFLINE_MAINTENANCE");
 const root=process.env.DRVO_MEDIA_STORAGE_DIR;
 if(!root||!isAbsolute(root))throw Error("EXPLICIT_ABSOLUTE_MEDIA_DIRECTORY_REQUIRED");
 const purged=await purgeContentBatch(businessId,target);
 const deletedFiles=await deleteQueuedMedia(businessId,root);
 console.log(JSON.stringify({mode:"apply",purged,deletedFiles,batchLimit:100}));
}
main().catch(e=>{console.error("privacy maintenance failed:",e instanceof Error?e.name:"UNKNOWN");process.exitCode=1;}).finally(()=>closePool());
