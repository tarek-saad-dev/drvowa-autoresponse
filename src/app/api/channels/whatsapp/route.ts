import { requireApiBusiness } from "@/lib/api/auth-context";
import { handleApiError, jsonOk } from "@/lib/api/http";
import { getWhatsAppConnectionView } from "@/modules/channels/whatsapp-service";

function toClientView(view: Awaited<ReturnType<typeof getWhatsAppConnectionView>>) {
  return {
    uiState: view.uiState,
    message: view.message ?? null,
    connection: view.connection
      ? {
          channelConnectionId: view.connection.channelConnectionId,
          channel: view.connection.channel,
          provider: view.connection.provider,
          displayName: view.connection.displayName,
          maskedPhone: view.connection.maskedPhone,
          status: view.connection.status,
          isActive: view.connection.isActive,
          // Never expose ExternalAccountKey / tokens to the browser
        }
      : null,
    runtime: view.runtime,
  };
}

export async function GET() {
  try {
    const { businessId } = await requireApiBusiness();
    const view = await getWhatsAppConnectionView({ businessId });
    return jsonOk(toClientView(view));
  } catch (error) {
    return handleApiError(error);
  }
}
