import { z } from "zod";
import { requireApiBusiness } from "@/lib/api/auth-context";
import { handleApiError,jsonOk,parseJsonBody } from "@/lib/api/http";
import { requireBusinessRole } from "@/lib/tenancy/require-role";
import { removeInboxContacts } from "@/modules/messaging/conversation-privacy-service";
import { getConversationForBusiness,getContactForBusiness } from "@/modules/messaging/repository";
import { changeApprovedContact } from "@/modules/messaging/privacy-mode-service";
import { changePrivateContact } from "@/modules/messaging/private-contact-service";
import { normalizePrivatePhone } from "@/modules/messaging/private-contact-policy";
import { NotFoundError,ConflictError } from "@/lib/tenancy/errors";
const schema=z.discriminatedUnion("action",[
 z.object({action:z.literal("remove"),conversationIds:z.array(z.string().uuid()).min(1).max(25)}).strict(),
 z.object({action:z.literal("approve"),conversationId:z.string().uuid()}).strict(),
 z.object({action:z.literal("private"),conversationId:z.string().uuid()}).strict()
]);
export async function POST(request:Request){
 try{
  const {businessId,user}=await requireApiBusiness();
  await requireBusinessRole(user.userId,businessId,["OWNER"]);
  const body=schema.parse(await parseJsonBody(request));
  if(body.action==="remove")return jsonOk(await removeInboxContacts(businessId,body.conversationIds));
  const conversation=await getConversationForBusiness({businessId,conversationId:body.conversationId});
  if(!conversation)throw new NotFoundError("Conversation not found");
  const contact=await getContactForBusiness({businessId,contactId:conversation.contactId});
  const phone=contact?.phoneNormalized?normalizePrivatePhone(contact.phoneNormalized):null;
  if(!phone)throw new ConflictError("Resolve contact phone first");
  if(body.action==="approve"){await changeApprovedContact(businessId,phone,true);return jsonOk({approved:true});}
  await changePrivateContact(businessId,phone,true);
  return jsonOk({hidden:true});
 }catch(e){return handleApiError(e);}
}
