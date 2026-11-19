import { z } from "zod";

import { handleApiError, jsonError, jsonOk, parseJsonBody } from "@/lib/api/http";
import { ForbiddenError } from "@/lib/tenancy/errors";
import { authenticateExternalIntegration, INTEGRATION_TYPE_DRVO_ERP } from "@/modules/integrations/service";
import { OtpApiError, verifyExternalOtp } from "@/modules/otp/service";

export const runtime = "nodejs";

const schema = z.object({
  challengeId: z.string().uuid(),
  phone: z.string().trim().min(8).max(32),
  purpose: z.enum(["CUT_CLUB_SIGNUP", "SIGNUP", "LOGIN", "PHONE_CHANGE"]),
  code: z.string().regex(/^\d{6}$/),
}).strict();

export async function POST(request: Request) {
  try {
    const integration = await authenticateExternalIntegration(request.headers.get("authorization"));
    if (integration.type !== INTEGRATION_TYPE_DRVO_ERP) {
      throw new ForbiddenError("OTP API requires a paired ERP integration");
    }
    const body = schema.parse(await parseJsonBody(request));
    return jsonOk(await verifyExternalOtp({ integration, ...body }));
  } catch (error) {
    if (error instanceof OtpApiError) return jsonError(error.message, error.status, { code: error.code });
    return handleApiError(error);
  }
}
