import { z } from "zod";

import { handleApiError, jsonError, jsonOk, parseJsonBody } from "@/lib/api/http";
import { ForbiddenError } from "@/lib/tenancy/errors";
import { authenticateExternalIntegration } from "@/modules/integrations/service";
import { allowsOtpPurpose } from "@/modules/integrations/otp-scope";
import { OtpApiError, sendExternalOtp } from "@/modules/otp/service";

export const runtime = "nodejs";

const schema = z.object({
  phone: z.string().trim().min(8).max(32),
  purpose: z.enum(["CUT_CLUB_SIGNUP", "SIGNUP", "LOGIN", "PHONE_CHANGE"]),
  requestId: z.string().uuid(),
}).strict();

export async function POST(request: Request) {
  try {
    const integration = await authenticateExternalIntegration(request.headers.get("authorization"), "otp");
    const body = schema.parse(await parseJsonBody(request));
    if (!allowsOtpPurpose(integration.type, body.purpose)) throw new ForbiddenError("OTP purpose not permitted");
    const result = await sendExternalOtp({ integration, ...body });
    return jsonOk(result, { status: result.status !== "SENT" ? 202 : 200 });
  } catch (error) {
    if (error instanceof OtpApiError) return jsonError(error.message, error.status, { code: error.code });
    return handleApiError(error);
  }
}
