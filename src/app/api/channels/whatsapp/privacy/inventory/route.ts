import { z } from "zod";
import { requireApiBusiness } from "@/lib/api/auth-context";
import { requireBusinessRole } from "@/lib/tenancy/require-role";
import { handleApiError,jsonOk } from "@/lib/api/http";
import { getPrivacyInventory,RETENTION_PREVIEW_DAYS } from "@/modules/messaging/privacy-center-service";
export async function GET(request:Request){
 try{
  const {user,businessId}=await requireApiBusiness();
  await requireBusinessRole(user.userId,businessId,["OWNER"]);
  const days=z.coerce.number().int().refine(n=>RETENTION_PREVIEW_DAYS.some(d=>d===n)).parse(new URL(request.url).searchParams.get("days")??"90");
  const res=jsonOk(await getPrivacyInventory(businessId,days));
  res.headers.set("Cache-Control","private, no-store");
  return res;
 }catch(e){return handleApiError(e);}
}
