import { requireApiBusiness } from "@/lib/api/auth-context";
import { handleApiError, jsonOk } from "@/lib/api/http";
import { getWhatsAppQrForBusiness } from "@/modules/channels/whatsapp-service";

export async function GET() {
  try {
    const { businessId } = await requireApiBusiness();
    const qr = await getWhatsAppQrForBusiness({ businessId });
    return jsonOk({
      uiState: qr.uiState,
      qrAvailable: qr.qrAvailable,
      qrImageDataUrl: qr.uiState === "READY" ? null : qr.qrImageDataUrl,
      message: qr.message ?? null,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
