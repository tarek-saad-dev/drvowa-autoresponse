import { z } from "zod";
import { requireApiBusiness } from "@/lib/api/auth-context";
import { requireBusinessRole } from "@/lib/tenancy/require-role";
import { handleApiError,jsonOk,parseJsonBody } from "@/lib/api/http";
import { previewWorkspaceReset,resetWhatsAppWorkspace } from "@/modules/messaging/workspace-reset-service";
async function owner(){const {businessId,user}=await requireApiBusiness();await requireBusinessRole(user.userId,businessId,["OWNER"]);return businessId;}
function noStore(value:object){const r=jsonOk(value);r.headers.set("Cache-Control","private, no-store");return r;}
export async function GET(){try{return noStore(await previewWorkspaceReset(await owner()));}catch(e){return handleApiError(e);}}
export async function POST(request:Request){try{const businessId=await owner();z.object({confirmation:z.literal("مسح الكل")}).strict().parse(await parseJsonBody(request));return noStore(await resetWhatsAppWorkspace(businessId));}catch(e){return handleApiError(e);}}
