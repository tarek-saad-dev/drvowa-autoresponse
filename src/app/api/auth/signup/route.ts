import { z } from "zod";

import { handleApiError, jsonOk, parseJsonBody } from "@/lib/api/http";
import {
  RATE_LIMITS,
  assertRateLimit,
  clientIpFromRequest,
} from "@/lib/security/rate-limit";
import { signup } from "@/modules/auth/service";

const signupSchema = z.object({
  email: z.string().email("Valid email is required"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  fullName: z.string().min(1, "Full name is required").max(200),
});

export async function POST(request: Request) {
  try {
    const body = await parseJsonBody(request);
    const input = signupSchema.parse(body);
    const ip = clientIpFromRequest(request);
    assertRateLimit(`signup:${ip}`, RATE_LIMITS.signup);
    const result = await signup(input);
    return jsonOk(result, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
