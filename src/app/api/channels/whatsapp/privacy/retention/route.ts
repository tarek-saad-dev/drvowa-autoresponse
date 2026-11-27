import { z } from "zod";
import { requireApiBusiness } from "@/lib/api/auth-context";
import { requireBusinessRole } from "@/lib/tenancy/require-role";
import { handleApiError,jsonOk,parseJsonBody } from "@/lib/api/http";
import { getRetentionPreference,saveRetentionPreference,RETENTION_DAYS } from "@/modules/messaging/privacy-purge-service";
async function owner(){const {user,businessId}=await requireApiBusiness();await requireBusinessRole(user.userId,businessId,["OWNER"]);return businessId;}
function response(days:number|null){const r=jsonOk({days,automatic:false});r.headers.set("Cache-Control","private, no-store");return r;}
export async function GET(){try{return response(await getRetentionPreference(await owner()));}catch(e){return handleApiError(e);}}
export async function POST(request:Request){try{const businessId=await owner();const {days}=z.object({days:z.number().int().refine(n=>RETENTION_DAYS.some(d=>d===n)).nullable()}).strict().parse(await parseJsonBody(request));return response(await saveRetentionPreference(businessId,days));}catch(e){return handleApiError(e);}}
