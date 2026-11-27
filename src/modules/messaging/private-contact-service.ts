import { query, sql, withTransaction } from "@/lib/db";
import { ConflictError } from "@/lib/tenancy/errors";
import { isPrivateContactBlocked } from "./private-contact-policy";

export async function listPrivateContactPhones(businessId: string): Promise<string[]> {
  const result = await query<{ PhoneNormalized: string }>(
    "SELECT PhoneNormalized FROM dbo.TblWhatsAppPrivateContact WHERE BusinessID=@businessId ORDER BY PhoneNormalized",
    [{ name: "businessId", type: sql.UniqueIdentifier, value: businessId }],
  );
  return result.recordset.map(row => row.PhoneNormalized);
}
export async function blocksPrivateContact(businessId: string, phone: string | null | undefined) {
  return isPrivateContactBlocked(await listPrivateContactPhones(businessId), phone);
}
export async function changePrivateContact(businessId: string, phone: string, add: boolean) {
  const params = [
    { name: "businessId", type: sql.UniqueIdentifier, value: businessId },
    { name: "phone", type: sql.VarChar(15), value: phone },
  ];
  await withTransaction(async trx => {
    if (!add) {
      await trx.execute("DELETE FROM dbo.TblWhatsAppPrivateContact WHERE BusinessID=@businessId AND PhoneNormalized=@phone", params);
      return;
    }
    // Serialize changes for this business and bound the worker policy payload.
    const rows = await trx.query<{ PhoneNormalized: string }>(
      "SELECT PhoneNormalized FROM dbo.TblWhatsAppPrivateContact WITH (UPDLOCK,HOLDLOCK) WHERE BusinessID=@businessId", [params[0]]);
    if (rows.recordset.some(row => row.PhoneNormalized === phone)) return;
    if (rows.recordset.length >= 100) throw new ConflictError("Private contact limit reached");
    await trx.execute("INSERT INTO dbo.TblWhatsAppPrivateContact (BusinessID,PhoneNormalized) VALUES (@businessId,@phone)", params);
  });
  return listPrivateContactPhones(businessId);
}
