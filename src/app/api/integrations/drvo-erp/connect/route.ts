import { z } from "zod";

import { requireApiBusiness } from "@/lib/api/auth-context";
import { handleApiError, jsonOk, parseJsonBody } from "@/lib/api/http";
import { configureDrvoErpIntegration } from "@/modules/integrations/service";

const schema = z.object({
  baseUrl: z.string().url().max(500),
  outboundToken: z.string().min(16).max(1000),
  externalReference: z.string().max(256).nullish(),
});

export async function POST(request: Request) {
  try {
    const { businessId } = await requireApiBusiness();
    const body = schema.parse(await parseJsonBody(request));
    const result = await configureDrvoErpIntegration({
      businessId,
      baseUrl: body.baseUrl,
      outboundToken: body.outboundToken,
      externalReference: body.externalReference ?? null,
    });
    return jsonOk({
      integration: {
        integrationId: result.integration.integrationId,
        type: result.integration.type,
        status: result.integration.status,
        baseUrl: result.integration.baseUrl,
        externalReference: result.integration.externalReference,
        lastHealthAtUtc: result.integration.lastHealthAtUtc,
        lastHealthStatus: result.integration.lastHealthStatus,
      },
      inboundApiKey: result.inboundApiKey,
      manifest: result.manifest,
      note: "Save inboundApiKey in the ERP now; it is returned only during setup.",
    });
  } catch (error) {
    return handleApiError(error);
  }
}
