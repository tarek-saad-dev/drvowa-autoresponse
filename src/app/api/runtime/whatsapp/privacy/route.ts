import { z } from "zod";
import { parseBoundedRuntimeJsonBody, requireRuntimeBearer } from "@/lib/api/runtime-auth";
import { handleApiError, jsonError, jsonOk } from "@/lib/api/http";
import { resolveChannelByExternalAccountKey } from "@/modules/messaging/repository";

const schema = z.object({ accountKey: z.string().trim().min(1).max(64) }).strict();

// Policy is selected by a DB-owned account key, never by a caller-supplied tenant.
export async function POST(request: Request) {
  try {
    requireRuntimeBearer(request.headers.get("authorization"));
    const { accountKey } = schema.parse(await parseBoundedRuntimeJsonBody(request));
    const channel = await resolveChannelByExternalAccountKey(accountKey);
    if (!channel) return jsonError("Unknown WhatsApp account", 404);
    // Pairing can request policy before the channel is ACTIVE. Legacy NULL keeps
    // existing behavior; the migration defaults new channels to false.
    const res = jsonOk({ historyImportEnabled: channel.whatsappHistoryImportEnabled !== false });
    res.headers.set("Cache-Control", "no-store");
    return res;
  } catch (error) {
    return handleApiError(error);
  }
}
