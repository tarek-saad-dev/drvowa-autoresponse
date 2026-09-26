import { requireApiBusiness } from "@/lib/api/auth-context";
import { handleApiError, jsonOk } from "@/lib/api/http";
import { getWhatsAppConnectionView } from "@/modules/channels/whatsapp-service";

export async function GET() {
  try {
    const { businessId } = await requireApiBusiness();
    const view = await getWhatsAppConnectionView({ businessId });
    return jsonOk({
      uiState: view.uiState,
      message: view.message ?? null,
      runtime: view.runtime,
      compatibility: view.compatibility ?? null,
      connection: view.connection
        ? {
            channelConnectionId: view.connection.channelConnectionId,
            status: view.connection.status,
            isActive: view.connection.isActive,
            displayName: view.connection.displayName,
            maskedPhone: view.connection.maskedPhone,
          }
        : null,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
