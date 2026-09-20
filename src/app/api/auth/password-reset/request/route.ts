import { z } from "zod";

import { handleApiError, jsonOk, parseJsonBody } from "@/lib/api/http";
import {
  RATE_LIMITS,
  assertRateLimit,
  clientIpFromRequest,
} from "@/lib/security/rate-limit";
import { requestPasswordReset } from "@/modules/auth/password-reset";

const schema = z.object({
  email: z.string().email("Valid email is required"),
});

/**
 * Always returns accepted — does not reveal whether the email exists.
 * Delivery depends on EMAIL_PROVIDER (EXTERNAL_GATE_EMAIL_PROVIDER in prod).
 */
export async function POST(request: Request) {
  try {
    const body = await parseJsonBody(request);
    const input = schema.parse(body);
    const ip = clientIpFromRequest(request);
    const emailKey = input.email.trim().toLowerCase();
    assertRateLimit(
      `password-reset:${ip}:${emailKey}`,
      RATE_LIMITS.passwordReset,
    );
    await requestPasswordReset({ email: input.email, requestIp: ip });
    return jsonOk({
      accepted: true,
      message:
        "If an account exists for this email, password reset instructions were sent.",
    });
  } catch (error) {
    return handleApiError(error);
  }
}
