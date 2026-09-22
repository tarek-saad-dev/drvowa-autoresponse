import { z } from "zod";

import { handleApiError, jsonOk, parseJsonBody } from "@/lib/api/http";
import {
  RATE_LIMITS,
  assertRateLimit,
  clientIpFromRequest,
} from "@/lib/security/rate-limit";
import { resolvePostLoginPath } from "@/modules/auth/post-login-redirect";
import { login } from "@/modules/auth/service";
import { listBusinessesForUser } from "@/modules/businesses/service";
import { isPlatformAdminUser } from "@/modules/platform-admin/service";

const loginSchema = z.object({
  email: z.string().email("Valid email is required"),
  password: z.string().min(1, "Password is required"),
});

export async function POST(request: Request) {
  try {
    const body = await parseJsonBody(request);
    const input = loginSchema.parse(body);
    const ip = clientIpFromRequest(request);
    const emailKey = input.email.trim().toLowerCase();
    assertRateLimit(`login:${ip}:${emailKey}`, RATE_LIMITS.login);
    const result = await login(input);
    const isPlatformAdmin = await isPlatformAdminUser(result.user.userId);
    const businesses = await listBusinessesForUser(result.user.userId);
    const redirectTo = resolvePostLoginPath({
      isPlatformAdmin,
      hasBusiness: businesses.length > 0,
    });
    return jsonOk({
      ...result,
      isPlatformAdmin,
      redirectTo,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
