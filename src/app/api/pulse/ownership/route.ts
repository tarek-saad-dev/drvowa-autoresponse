import { requireApiBusiness } from "@/lib/api/auth-context";
import { handleApiError, jsonOk } from "@/lib/api/http";
import { getHumanOwnershipSnapshot } from "@/modules/ai/human-ownership";

/** Lightweight authenticated poll; no message bodies or customer phone numbers. */
export async function GET(request:Request) {
  try {
    const requestedBusiness=new URL(request.url).searchParams.get("businessId");
    const {businessId}=await requireApiBusiness({businessId:requestedBusiness});
    const result=jsonOk(await getHumanOwnershipSnapshot(businessId));
    result.headers.set("Cache-Control","private, no-store");
    return result;
  }catch(error){return handleApiError(error);}
}
