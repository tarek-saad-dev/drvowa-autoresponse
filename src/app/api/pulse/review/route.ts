import { z } from "zod";
import { requireApiBusiness } from "@/lib/api/auth-context";
import { handleApiError, jsonOk, parseJsonBody } from "@/lib/api/http";
import { markPulseSignalReviewed } from "@/modules/pulse/report";
const schema=z.object({
 conversationId:z.string().uuid(),
 intent:z.enum(["BOOKING","PRICE","COMPLAINT","HUMAN","REFUND","PURCHASE","LOCATION","HOURS"]),
}).strict();
export async function POST(request:Request) {
 try {
  const {businessId}=await requireApiBusiness();
  const {conversationId,intent}=schema.parse(await parseJsonBody(request));
  const updated=await markPulseSignalReviewed({businessId,conversationId,intent});
  return jsonOk({updated});
 }catch(error){return handleApiError(error);}
}
