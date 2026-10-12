import { z } from "zod";
import { requireApiBusiness } from "@/lib/api/auth-context";
import { handleApiError, jsonOk, parseJsonBody } from "@/lib/api/http";
import { createEscalation, getEscalation, updateEscalationStatus } from "@/modules/escalations/service";

type Context = { params: Promise<{ conversationId: string }> };
const createSchema = z.object({
  reason: z.string().trim().min(4).max(300),
});
const transitionSchema = z.object({
  status: z.enum(["ACKNOWLEDGED", "RESOLVED"]),
});
export async function GET(_request: Request, context: Context) {
  try {
    const { businessId } = await requireApiBusiness();
    const { conversationId } = await context.params;
    return jsonOk({ escalation: await getEscalation(businessId, conversationId) });
  } catch (error) { return handleApiError(error); }
}
export async function POST(request: Request, context: Context) {
  try {
    const { businessId } = await requireApiBusiness();
    const { conversationId } = await context.params;
    const { reason } = createSchema.parse(await parseJsonBody(request));
    return jsonOk(await createEscalation({ businessId, conversationId,
      reasonCode: "MANUAL_REQUEST", reason, pauseAi: true }));
  } catch (error) { return handleApiError(error); }
}
export async function PATCH(request: Request, context: Context) {
  try {
    const { businessId, user } = await requireApiBusiness();
    const { conversationId } = await context.params;
    const { status } = transitionSchema.parse(await parseJsonBody(request));
    return jsonOk({ escalation: await updateEscalationStatus({
      businessId, conversationId, userId: user.userId, status,
    }) });
  } catch (error) { return handleApiError(error); }
}
