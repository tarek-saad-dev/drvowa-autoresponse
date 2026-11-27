import { query, sql, withTransaction } from "@/lib/db";
import { ConflictError } from "@/lib/tenancy/errors";
import type { PrivacyMode, PrivacyModePolicy } from "./privacy-mode-policy";
const scope = (businessId: string) => [{ name: "businessId", type: sql.UniqueIdentifier, value: businessId }];
export async function getPrivacyMode(businessId: string): Promise<PrivacyModePolicy> {
  const [settings, contacts] = await Promise.all([
    query<{ Mode: PrivacyMode; UpdatedAtUtc: Date }>("SELECT Mode,UpdatedAtUtc FROM dbo.TblWhatsAppPrivacyMode WHERE BusinessID=@businessId", scope(businessId)),
    query<{ PhoneNormalized: string; ApprovedAtUtc: Date }>("SELECT PhoneNormalized,ApprovedAtUtc FROM dbo.TblWhatsAppApprovedContact WHERE BusinessID=@businessId ORDER BY PhoneNormalized", scope(businessId))
  ]);
  const row = settings.recordset[0];
  return { mode: row?.Mode ?? "ALL", updatedAtUtc: row?.UpdatedAtUtc ?? null,
    approved: contacts.recordset.map(c => ({ phone: c.PhoneNormalized, at: c.ApprovedAtUtc })) };
}
export async function setPrivacyMode(businessId: string, mode: PrivacyMode) {
  await query("MERGE dbo.TblWhatsAppPrivacyMode WITH (HOLDLOCK) AS t USING (SELECT @businessId AS BusinessID) AS s ON t.BusinessID=s.BusinessID WHEN MATCHED AND t.Mode<>@mode THEN UPDATE SET Mode=@mode,UpdatedAtUtc=SYSUTCDATETIME() WHEN NOT MATCHED THEN INSERT (BusinessID,Mode) VALUES (@businessId,@mode);",
    [...scope(businessId), { name: "mode", type: sql.VarChar(20), value: mode }]);
  return getPrivacyMode(businessId);
}
export async function changeApprovedContact(businessId: string, phone: string, add: boolean) {
  const params = [...scope(businessId), { name: "phone", type: sql.VarChar(15), value: phone }];
  await withTransaction(async trx => {
    if (!add) { await trx.execute("DELETE FROM dbo.TblWhatsAppApprovedContact WHERE BusinessID=@businessId AND PhoneNormalized=@phone", params); return; }
    const rows = await trx.query<{ PhoneNormalized: string }>("SELECT PhoneNormalized FROM dbo.TblWhatsAppApprovedContact WITH (UPDLOCK,HOLDLOCK) WHERE BusinessID=@businessId", scope(businessId));
    if (rows.recordset.some(r => r.PhoneNormalized === phone)) return;
    if (rows.recordset.length >= 1000) throw new ConflictError("Approved contact limit reached");
    await trx.execute("INSERT INTO dbo.TblWhatsAppApprovedContact (BusinessID,PhoneNormalized) VALUES (@businessId,@phone)", params);
  });
  return getPrivacyMode(businessId);
}
