import { requireApiBusiness } from "@/lib/api/auth-context";
import { handleApiError, jsonOk } from "@/lib/api/http";
import {
  RATE_LIMITS,
  assertRateLimit,
} from "@/lib/security/rate-limit";
import { startWhatsAppPairing } from "@/modules/channels/whatsapp-service";

export async function POST() {
  try {
    const { businessId } = await requireApiBusiness();
    assertRateLimit(`wa-connect:${businessId}`, RATE_LIMITS.whatsappConnect);
    // Browser cannot supply accountKey — DB-owned ExternalAccountKey only.
    const view = await startWhatsAppPairing({ businessId });
    return jsonOk({
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
          }
        : null,
      runtime: view.runtime,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
