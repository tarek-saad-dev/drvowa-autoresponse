import { handleApiError, jsonOk } from "@/lib/api/http";
import { requirePlatformAdmin } from "@/modules/platform-admin/service";
import { getWhatsAppAdminAlertCount } from "@/modules/reliability/whatsapp-alert-service";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    await requirePlatformAdmin();
    const res = jsonOk(await getWhatsAppAdminAlertCount());
    res.headers.set("Cache-Control", "private, no-store");
    return res;
  } catch (error) { return handleApiError(error); }
}
