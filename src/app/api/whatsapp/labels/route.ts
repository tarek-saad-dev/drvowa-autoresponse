import { requireApiBusiness } from "@/lib/api/auth-context";
import { handleApiError, jsonOk } from "@/lib/api/http";
import { listMirroredWhatsAppLabels } from "@/modules/messaging/whatsapp-label-sync-service";

/** Read-only diagnostics; never exposes recipient phone numbers or authorizes campaigns. */
export async function GET() {
  try {
    const { businessId } = await requireApiBusiness();
    const labels = await listMirroredWhatsAppLabels(businessId);
    return jsonOk({
      labels,
      syncCoverage: "EVENT_DRIVEN_PARTIAL",
      audienceReady: false,
      message: "Label events are mirrored, but historical completeness and marketing consent are not verified.",
    });
  } catch (error) {
    return handleApiError(error);
  }
}
