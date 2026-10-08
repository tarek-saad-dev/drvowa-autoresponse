import { z } from "zod";

import { handleApiError, jsonOk, parseJsonBody } from "@/lib/api/http";
import { completeExternalDrvoErpPairing } from "@/modules/integrations/service";

const schema = z.object({
  pairingCode: z.string().min(8).max(32),
  baseUrl: z.string().url().max(500),
  outboundToken: z.string().min(24).max(1000),
  externalReference: z.string().max(256).nullish(),
});

export async function POST(request: Request) {
  try {
    const body = schema.parse(await parseJsonBody(request));
    const result = await completeExternalDrvoErpPairing({
      pairingCode: body.pairingCode,
      baseUrl: body.baseUrl,
      outboundToken: body.outboundToken,
      externalReference: body.externalReference ?? null,
    });
    return jsonOk({
      ok: true,
      integrationId: result.integration.integrationId,
      inboundApiKey: result.inboundApiKey,
      next: {
        refreshUrl: "/api/external/v1/integrations/refresh",
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
