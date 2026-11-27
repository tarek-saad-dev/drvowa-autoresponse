import { query, sql } from "@/lib/db";
import { generateIntegrationApiKey, hashIntegrationApiKey } from "@/lib/security/integration-secrets";
import { findWhatsAppConnection } from "@/modules/channels/repository";
import { ValidationError } from "@/lib/tenancy/errors";
import { getIntegrationByType } from "./repository";
import { PLATFORM_SIGNUP_OTP_TYPE } from "./otp-scope";

export async function signupOtpKeyStatus(businessId: string) {
  const row = await getIntegrationByType({businessId,type:PLATFORM_SIGNUP_OTP_TYPE});
  return {active:row?.status==="ACTIVE" && !!row.inboundApiKeyHash,updatedAtUtc:row?.updatedAtUtc??null};
}
export async function rotateSignupOtpKey(businessId: string) {
  const connection = await findWhatsAppConnection({businessId});
  if (!connection?.isActive || connection.status!=="ACTIVE" || !connection.externalAccountKey)
    throw new ValidationError("اربط واتساب المنشأة أولًا.");
  const key=generateIntegrationApiKey();
  // Existing unique (BusinessID, Type) and filtered key hash indexes; one atomic statement.
  await query(`
    MERGE dbo.TblIntegration WITH (HOLDLOCK) AS target
    USING (SELECT @businessId AS BusinessID, @type AS Type) AS source
      ON target.BusinessID=source.BusinessID AND target.Type=source.Type
    WHEN MATCHED THEN UPDATE SET InboundApiKeyHash=@hash, Status=N'ACTIVE', UpdatedAtUtc=SYSUTCDATETIME()
    WHEN NOT MATCHED THEN INSERT (BusinessID,Type,Status,InboundApiKeyHash)
      VALUES (@businessId,@type,N'ACTIVE',@hash);
  `,[
    {name:"businessId",type:sql.UniqueIdentifier,value:businessId},
    {name:"type",type:sql.NVarChar(64),value:PLATFORM_SIGNUP_OTP_TYPE},
    {name:"hash",type:sql.NVarChar(128),value:hashIntegrationApiKey(key)},
  ]);
  return key;
}
export async function revokeSignupOtpKey(businessId:string){
  await query(`
    UPDATE dbo.TblIntegration SET InboundApiKeyHash=NULL, Status=N'INACTIVE', UpdatedAtUtc=SYSUTCDATETIME()
    WHERE BusinessID=@businessId AND Type=@type;
  `,[
    {name:"businessId",type:sql.UniqueIdentifier,value:businessId},
    {name:"type",type:sql.NVarChar(64),value:PLATFORM_SIGNUP_OTP_TYPE},
  ]);
}
