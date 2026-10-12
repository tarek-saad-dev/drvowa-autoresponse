import { z } from "zod";
import { requireApiBusiness } from "@/lib/api/auth-context";
import { handleApiError, jsonOk, parseJsonBody } from "@/lib/api/http";
import { confirmOwnerVerification, requestOwnerVerification } from "@/modules/escalations/service";

const schema = z.object({ code: z.string().regex(/^\d{6}$/) });

export async function POST() {
  try {
    const { businessId, user } = await requireApiBusiness();
    return jsonOk(await requestOwnerVerification(businessId, user.userId));
  } catch (error) { return handleApiError(error); }
}
export async function PATCH(request: Request) {
  try {
    const { businessId, user } = await requireApiBusiness();
    const { code } = schema.parse(await parseJsonBody(request));
    return jsonOk(await confirmOwnerVerification(businessId, user.userId, code));
  } catch (error) { return handleApiError(error); }
}
