import { z } from "zod";

import { handleApiError, jsonError, jsonOk, parseJsonBody } from "@/lib/api/http";
import {
  RATE_LIMITS,
  assertRateLimit,
  clientIpFromRequest,
} from "@/lib/security/rate-limit";
import { completePasswordReset } from "@/modules/auth/password-reset";

const schema = z.object({
  token: z.string().min(16).max(200),
  password: z.string().min(8, "Password must be at least 8 characters").max(200),
});

export async function POST(request: Request) {
  try {
    const body = await parseJsonBody(request);
    const input = schema.parse(body);
    const ip = clientIpFromRequest(request);
    assertRateLimit(`password-reset-complete:${ip}`, RATE_LIMITS.passwordReset);
    const result = await completePasswordReset({
      rawToken: input.token,
      newPassword: input.password,
    });
    if (!result.ok) {
      return jsonError(result.code, 400, { code: result.code });
    }
    return jsonOk({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
