import { z } from "zod";

import { handleApiError, jsonOk, parseJsonBody } from "@/lib/api/http";
import {
  RATE_LIMITS,
  assertRateLimit,
  clientIpFromRequest,
} from "@/lib/security/rate-limit";
import { login } from "@/modules/auth/service";

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
    return jsonOk(result);
  } catch (error) {
    return handleApiError(error);
  }
}
