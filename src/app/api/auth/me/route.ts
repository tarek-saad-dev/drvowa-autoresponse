import { requireApiUser } from "@/lib/api/auth-context";
import { handleApiError, jsonOk } from "@/lib/api/http";
import { isPlatformAdminUser } from "@/modules/platform-admin/service";

export async function GET() {
  try {
    const user = await requireApiUser();
    const isPlatformAdmin = await isPlatformAdminUser(user.userId);
    return jsonOk({
      userId: user.userId,
      email: user.email,
      fullName: user.fullName,
      sessionId: user.sessionId,
      activeBusinessId: user.activeBusinessId,
      isPlatformAdmin,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
