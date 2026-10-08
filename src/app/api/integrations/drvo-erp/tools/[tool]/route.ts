import { z } from "zod";

import { requireApiBusiness } from "@/lib/api/auth-context";
import { handleApiError, jsonOk, parseJsonBody } from "@/lib/api/http";
import { invokeDrvoErpTool } from "@/modules/integrations/service";

type Context = { params: Promise<{ tool: string }> };

const schema = z.object({
  input: z.record(z.string(), z.unknown()).default({}),
  requestId: z.string().min(1).max(128).optional(),
});

export async function POST(request: Request, context: Context) {
  try {
    const { businessId } = await requireApiBusiness();
    const { tool } = await context.params;
    const body = schema.parse(await parseJsonBody(request));
    const result = await invokeDrvoErpTool({
      businessId,
      tool,
      input: body.input,
      requestId: body.requestId,
    });
    return jsonOk(result);
  } catch (error) {
    return handleApiError(error);
  }
}
