import { requireApiUser } from "@/lib/api/auth-context";
import { handleApiError, jsonOk } from "@/lib/api/http";
import { listBusinessesForUser } from "@/modules/businesses/service";

export async function GET() {
  try {
    const user = await requireApiUser();
    const businesses = await listBusinessesForUser(user.userId);
    return jsonOk({ businesses });
  } catch (error) {
    return handleApiError(error);
  }
}
