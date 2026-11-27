import { z } from "zod";
import { requireApiBusiness } from "@/lib/api/auth-context";
import { handleApiError, jsonOk, parseJsonBody } from "@/lib/api/http";
import { requireBusinessRole } from "@/lib/tenancy/require-role";
import { getPrivacyMode, setPrivacyMode, changeApprovedContact } from "@/modules/messaging/privacy-mode-service";
import { PRIVACY_MODES, type PrivacyModePolicy } from "@/modules/messaging/privacy-mode-policy";
import { normalizePrivatePhone } from "@/modules/messaging/private-contact-policy";
const change = z.discriminatedUnion("action", [
  z.object({ action: z.literal("mode"), mode: z.enum(PRIVACY_MODES) }).strict(),
  z.object({ action: z.enum(["approve","revoke"]), phone: z.string().max(40) }).strict()
]);
async function owner() { const { user, businessId } = await requireApiBusiness(); await requireBusinessRole(user.userId, businessId, ["OWNER"]); return businessId; }
function response(p: PrivacyModePolicy) { const res = jsonOk({ mode: p.mode, approved: p.approved.map(c => c.phone) }); res.headers.set("Cache-Control", "no-store"); return res; }
export async function GET() { try { return response(await getPrivacyMode(await owner())); } catch(e) { return handleApiError(e); } }
export async function POST(request: Request) {
 try {
  const businessId = await owner();
  const data = change.parse(await parseJsonBody(request));
  if (data.action === "mode") return response(await setPrivacyMode(businessId,data.mode));
  const phone = z.string().parse(normalizePrivatePhone(data.phone));
  return response(await changeApprovedContact(businessId,phone,data.action === "approve"));
 } catch(e) { return handleApiError(e); }
}
