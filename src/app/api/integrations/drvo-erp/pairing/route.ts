import { requireApiBusiness } from "@/lib/api/auth-context";
import { handleApiError, jsonOk } from "@/lib/api/http";
import { createDrvoErpPairing } from "@/modules/integrations/service";

export async function POST() {
  try {
    const { businessId, user } = await requireApiBusiness();
    const pairing = await createDrvoErpPairing({
      businessId,
      userId: user.userId,
    });
    return jsonOk({
      pairingCode: pairing.pairingCode,
      expiresAtUtc: pairing.expiresAtUtc,
      expiresInSeconds: 15 * 60,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
