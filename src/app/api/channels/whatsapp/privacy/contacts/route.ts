import { z } from "zod";
import { requireApiBusiness } from "@/lib/api/auth-context";
import { handleApiError, jsonOk, parseJsonBody } from "@/lib/api/http";
import { requireBusinessRole } from "@/lib/tenancy/require-role";
import { listPrivateContactPhones, changePrivateContact } from "@/modules/messaging/private-contact-service";
import { normalizePrivatePhone } from "@/modules/messaging/private-contact-policy";
const schema = z.object({ phone: z.string().max(40).transform(normalizePrivatePhone).pipe(z.string()) }).strict();

async function ownerBusiness() {
  const { businessId, user } = await requireApiBusiness();
  await requireBusinessRole(user.userId, businessId, ["OWNER"]);
  return businessId;
}
function response(phones: string[]) {
  const res = jsonOk({ phones });
  res.headers.set("Cache-Control", "no-store");
  return res;
}
export async function GET() {
  try { return response(await listPrivateContactPhones(await ownerBusiness())); }
  catch (error) { return handleApiError(error); }
}
async function change(request: Request, add: boolean) {
  try {
    const businessId = await ownerBusiness();
    const { phone } = schema.parse(await parseJsonBody(request));
    return response(await changePrivateContact(businessId, phone, add));
  } catch (error) { return handleApiError(error); }
}
export async function POST(request: Request) { return change(request, true); }
export async function DELETE(request: Request) { return change(request, false); }
