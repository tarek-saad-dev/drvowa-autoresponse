import { requireRuntimeBearer, parseBoundedRuntimeJsonBody } from "@/lib/api/runtime-auth";
import { handleApiError, jsonOk } from "@/lib/api/http";
import { receiptBatchSchema, recordRuntimeReceipts } from "@/modules/reliability/service";

export async function POST(request: Request) {
  try {
    requireRuntimeBearer(request.headers.get("authorization"));
    const data = receiptBatchSchema.parse(await parseBoundedRuntimeJsonBody(request));
    const accepted = await recordRuntimeReceipts(data);
    return jsonOk({ accepted });
  } catch (error) { return handleApiError(error); }
}
