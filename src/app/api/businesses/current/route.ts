import { z } from "zod";

import { requireApiBusiness } from "@/lib/api/auth-context";
import { handleApiError, jsonOk, parseJsonBody } from "@/lib/api/http";
import {
  getBusinessById,
  updateBusiness,
} from "@/modules/businesses/service";

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  category: z.string().min(1).optional(),
  countryCode: z.string().min(2).max(2).optional(),
  locale: z.string().min(1).optional(),
  timezone: z.string().min(1).optional(),
  status: z.enum(["ACTIVE", "INACTIVE", "SUSPENDED"]).optional(),
});

export async function GET() {
  try {
    const { businessId } = await requireApiBusiness();
    const business = await getBusinessById({ businessId });
    return jsonOk({ business });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const { businessId } = await requireApiBusiness();
    const body = await parseJsonBody(request);
    const input = updateSchema.parse(body);

    const business = await updateBusiness({
      businessId,
      ...input,
    });

    return jsonOk({ business });
  } catch (error) {
    return handleApiError(error);
  }
}
