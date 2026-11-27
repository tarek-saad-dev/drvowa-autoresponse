import { z } from "zod";
import { parseBoundedRuntimeJsonBody, requireRuntimeBearer } from "@/lib/api/runtime-auth";
import { handleApiError, jsonError, jsonOk } from "@/lib/api/http";
import { getPrivacyMode } from "@/modules/messaging/privacy-mode-service";
import { listPrivateContactPhones } from "@/modules/messaging/private-contact-service";
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
    const mode = await getPrivacyMode(channel.businessId);
    const res = jsonOk({ historyImportEnabled: channel.whatsappHistoryImportEnabled !== false,
      privateContactPhones: await listPrivateContactPhones(channel.businessId),
      mode: mode.mode, approvedContactPhones: mode.approved.map(c => c.phone) });
    res.headers.set("Cache-Control", "no-store");
    return res;
  } catch (error) {
    return handleApiError(error);
  }
}
