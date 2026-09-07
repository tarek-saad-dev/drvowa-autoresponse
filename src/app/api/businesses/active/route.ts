import { z } from "zod";

import { requireApiUser } from "@/lib/api/auth-context";
import { handleApiError, jsonOk, parseJsonBody } from "@/lib/api/http";
import { setActiveBusiness } from "@/lib/tenancy";

const schema = z.object({
  businessId: z.string().uuid("Valid businessId is required"),
});

export async function POST(request: Request) {
  try {
    const user = await requireApiUser();
    const body = await parseJsonBody(request);
    const { businessId } = schema.parse(body);

    await setActiveBusiness({
      sessionId: user.sessionId,
      userId: user.userId,
      businessId,
    });

    return jsonOk({ activeBusinessId: businessId });
  } catch (error) {
    return handleApiError(error);
  }
}
