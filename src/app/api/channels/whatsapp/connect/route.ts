import { requireApiBusiness } from "@/lib/api/auth-context";
import { z } from "zod";
import { handleApiError, jsonOk, parseJsonBody } from "@/lib/api/http";
import {
  RATE_LIMITS,
  assertRateLimit,
} from "@/lib/security/rate-limit";
import { startWhatsAppPairing } from "@/modules/channels/whatsapp-service";

const pairingPrivacySchema = z.object({ historyImportEnabled: z.boolean() }).strict();

export async function POST(request: Request) {
  try {
    const { businessId } = await requireApiBusiness();
    assertRateLimit(`wa-connect:${businessId}`, RATE_LIMITS.whatsappConnect);
    // Browser cannot supply accountKey — DB-owned ExternalAccountKey only.
    const privacy = request.body ? pairingPrivacySchema.parse(await parseJsonBody(request)) : undefined;
    const view = await startWhatsAppPairing({ businessId, historyImportEnabled: privacy?.historyImportEnabled });
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
