import { sql, withTransaction } from "@/lib/db";
import { ConflictError, NotFoundError } from "@/lib/tenancy/errors";
import { normalizePrivatePhone } from "./private-contact-policy";

export async function removeInboxContacts(businessId: string, ids: string[]) {
  return withTransaction(async trx => {
    const scope = { name: "businessId", type: sql.UniqueIdentifier, value: businessId };
    const keys = [...new Set(ids.map(id => id.toLowerCase()))];
    const params = keys.map((id,i) => ({name:"id"+i,type:sql.UniqueIdentifier,value:id}));
    const rows = await trx.query<{ ConversationID:string; PhoneNormalized:string|null }>(
      `SELECT c.ConversationID,ct.PhoneNormalized FROM dbo.TblConversation c
       JOIN dbo.TblContact ct ON ct.BusinessID=c.BusinessID AND ct.ContactID=c.ContactID
       JOIN dbo.TblChannelConnection ch ON ch.BusinessID=c.BusinessID AND ch.ChannelConnectionID=c.ChannelConnectionID
       WHERE c.BusinessID=@businessId AND ch.Channel=N'WHATSAPP' AND c.ConversationID IN (${params.map(p=>"@"+p.name).join(",")})`,
      [scope,...params]);
    if(rows.recordset.length!==keys.length) throw new NotFoundError("Conversation not found");
    const phones = rows.recordset.map(row=>row.PhoneNormalized ? normalizePrivatePhone(row.PhoneNormalized) : null);
    if(phones.some(phone=>!phone)) throw new ConflictError("Resolve contact phone before removal");
    const unique = [...new Set(phones.filter((p):p is string=>p!==null))];
    const existing = await trx.query<{PhoneNormalized:string}>("SELECT PhoneNormalized FROM dbo.TblWhatsAppRemovedContact WITH (UPDLOCK,HOLDLOCK) WHERE BusinessID=@businessId",[scope]);
    const seen = new Set(existing.recordset.map(row=>row.PhoneNormalized));
    const added = unique.filter(phone=>!seen.has(phone));
    if(seen.size+added.length>1000) throw new ConflictError("Removed contact limit reached");
    for(const phone of added) await trx.execute("INSERT INTO dbo.TblWhatsAppRemovedContact (BusinessID,PhoneNormalized) VALUES (@businessId,@phone)",[scope,{name:"phone",type:sql.VarChar(15),value:phone}]);
    // Return all conversation IDs sharing the phone in this business, not just selected IDs.
    const phoneParams=unique.map((phone,i)=>({name:"p"+i,type:sql.VarChar(15),value:phone}));
    const hidden=await trx.query<{ConversationID:string}>(`SELECT c.ConversationID FROM dbo.TblConversation c JOIN dbo.TblContact ct ON ct.BusinessID=c.BusinessID AND ct.ContactID=c.ContactID JOIN dbo.TblChannelConnection ch ON ch.BusinessID=c.BusinessID AND ch.ChannelConnectionID=c.ChannelConnectionID WHERE c.BusinessID=@businessId AND ch.Channel=N'WHATSAPP' AND ct.PhoneNormalized IN (${phoneParams.map(p=>"@"+p.name).join(",")})`,[scope,...phoneParams]);
    return { removedIds:hidden.recordset.map(row=>row.ConversationID.toLowerCase()) };
  });
}
