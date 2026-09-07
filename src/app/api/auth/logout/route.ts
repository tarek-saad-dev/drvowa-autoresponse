import { handleApiError, jsonOk } from "@/lib/api/http";
import { logout } from "@/modules/auth/service";

export async function POST() {
  try {
    await logout();
    return jsonOk({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
