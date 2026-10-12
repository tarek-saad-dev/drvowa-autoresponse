import { z } from "zod";
import { requireApiBusiness } from "@/lib/api/auth-context";
import { handleApiError, jsonOk, parseJsonBody } from "@/lib/api/http";
import {
  getEscalationSetting, updateEscalationSetting, requireEscalationAdmin,
} from "@/modules/escalations/service";

const schema = z.object({
  phone: z.string().trim().min(8).max(28),
  enabled: z.boolean(),
});

export async function GET() {
  try {
    const { businessId, user } = await requireApiBusiness();
    await requireEscalationAdmin(businessId, user.userId);
    return jsonOk({ setting: await getEscalationSetting(businessId) });
  } catch (error) { return handleApiError(error); }
}
export async function PATCH(request: Request) {
  try {
    const { businessId, user } = await requireApiBusiness();
    const params = schema.parse(await parseJsonBody(request));
    return jsonOk({ setting: await updateEscalationSetting({ ...params, businessId, userId: user.userId }) });
  } catch (error) { return handleApiError(error); }
}
