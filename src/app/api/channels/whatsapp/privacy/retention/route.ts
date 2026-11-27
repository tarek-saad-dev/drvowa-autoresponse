import { z } from "zod";
import { requireApiBusiness } from "@/lib/api/auth-context";
import { requireBusinessRole } from "@/lib/tenancy/require-role";
import { handleApiError,jsonError,jsonOk,parseJsonBody } from "@/lib/api/http";
import {getRetentionSettings,saveRetentionPreference,automaticRetentionAvailable,RETENTION_DAYS} from "@/modules/messaging/privacy-purge-service";
async function owner(){const {user,businessId}=await requireApiBusiness();await requireBusinessRole(user.userId,businessId,["OWNER"]);return businessId;}
function response(data:Awaited<ReturnType<typeof getRetentionSettings>>){const r=jsonOk(data);r.headers.set("Cache-Control","private, no-store");return r;}
export async function GET(){try{return response(await getRetentionSettings(await owner()));}catch(e){return handleApiError(e);}}
export async function POST(request:Request){try{
 const businessId=await owner();
 const {days,automatic,confirmation}=z.object({days:z.number().int().refine(n=>RETENTION_DAYS.some(d=>d===n)).nullable(),automatic:z.boolean().default(false),confirmation:z.literal("DELETE_EXPIRED_CONTENT").optional()}).strict().parse(await parseJsonBody(request));
 if(automatic&&(days===null||confirmation!=="DELETE_EXPIRED_CONTENT"))return jsonError("Explicit retention deletion confirmation required",400);
 if(automatic&&!automaticRetentionAvailable())return jsonError("Automatic retention unavailable",409);
 await saveRetentionPreference(businessId,days,automatic);
 return response(await getRetentionSettings(businessId));
}catch(e){return handleApiError(e);}}
