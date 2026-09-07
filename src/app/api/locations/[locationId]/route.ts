import { z } from "zod";

import { requireApiBusiness } from "@/lib/api/auth-context";
import { handleApiError, jsonOk, parseJsonBody } from "@/lib/api/http";
import {
  deleteLocation,
  updateLocation,
} from "@/modules/locations/service";

const updateSchema = z.object({
  businessId: z.string().uuid().optional(),
  name: z.string().min(1).optional(),
  code: z.string().nullable().optional(),
  timezone: z.string().nullable().optional(),
  addressLine: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
});

type RouteContext = {
  params: Promise<{ locationId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { locationId } = await context.params;
    const body = await parseJsonBody(request);
    const input = updateSchema.parse(body);
    const { businessId } = await requireApiBusiness({
      businessId: input.businessId,
    });

    const location = await updateLocation({
      businessId,
      locationId,
      name: input.name,
      code: input.code,
      timezone: input.timezone,
      addressLine: input.addressLine,
      city: input.city,
      phone: input.phone,
      isActive: input.isActive,
    });

    return jsonOk({ location });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const { locationId } = await context.params;
    const url = new URL(request.url);
    const queryBusinessId = url.searchParams.get("businessId");
    let bodyBusinessId: string | undefined;
    try {
      const body = (await request.json()) as { businessId?: string };
      bodyBusinessId = body?.businessId;
    } catch {
      bodyBusinessId = undefined;
    }

    const { businessId } = await requireApiBusiness({
      businessId: bodyBusinessId ?? queryBusinessId,
    });

    await deleteLocation({ businessId, locationId });
    return jsonOk({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
