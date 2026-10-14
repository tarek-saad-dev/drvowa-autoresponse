import { requireApiBusiness } from "@/lib/api/auth-context";
import { handleApiError, jsonOk } from "@/lib/api/http";
import { requireEscalationAdmin } from "@/modules/escalations/service";
import { resumeAllHumanConversations } from "@/modules/ai/bulk-resume-service";

/**
 * One-click return to AI, strictly limited to the authenticated workspace.
 * Active human escalations and safety pauses are not overridden.
 */
export async function POST() {
  try {
    const { businessId, user } = await requireApiBusiness();
    await requireEscalationAdmin(businessId, user.userId);
    const resumed = await resumeAllHumanConversations({ businessId });
    return jsonOk({ resumed, skippedActiveEscalationsAndSafety: true });
  } catch (error) {
    return handleApiError(error);
  }
}
