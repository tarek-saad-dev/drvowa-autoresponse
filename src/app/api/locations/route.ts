import { z } from "zod";

import { requireApiBusiness } from "@/lib/api/auth-context";
import { handleApiError, jsonOk, parseJsonBody } from "@/lib/api/http";
import {
  createLocation,
  listLocations,
} from "@/modules/locations/service";

const createSchema = z.object({
  businessId: z.string().uuid().optional(),
  name: z.string().min(1, "Name is required"),
  code: z.string().nullable().optional(),
  timezone: z.string().nullable().optional(),
  addressLine: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
});

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const queryBusinessId = url.searchParams.get("businessId");
    const { businessId } = await requireApiBusiness({
      businessId: queryBusinessId,
    });
    const locations = await listLocations({ businessId });
    return jsonOk({ locations });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await parseJsonBody(request);
    const input = createSchema.parse(body);
    const { businessId } = await requireApiBusiness({
      businessId: input.businessId,
    });

    const location = await createLocation({
      businessId,
      name: input.name,
      code: input.code,
      timezone: input.timezone,
      addressLine: input.addressLine,
      city: input.city,
      phone: input.phone,
      isActive: input.isActive,
    });

    return jsonOk({ location }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
