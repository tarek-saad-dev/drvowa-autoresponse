import { requireApiUser } from "@/lib/api/auth-context";
import { handleApiError, jsonOk } from "@/lib/api/http";

export async function GET() {
  try {
    const user = await requireApiUser();
    return jsonOk({
      userId: user.userId,
      email: user.email,
      fullName: user.fullName,
      sessionId: user.sessionId,
      activeBusinessId: user.activeBusinessId,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
