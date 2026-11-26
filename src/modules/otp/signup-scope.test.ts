import { describe,expect,it } from "vitest";
import { allowsExternalIntegration, allowsOtpPurpose, PLATFORM_SIGNUP_OTP_TYPE } from "../integrations/otp-scope";
import { readFileSync } from "node:fs";

describe("dedicated signup OTP key",()=>{
  it("allows signup-only access and denies ordinary ERP endpoints",()=>{
    expect(allowsExternalIntegration(PLATFORM_SIGNUP_OTP_TYPE,"erp")).toBe(false);
    expect(allowsExternalIntegration(PLATFORM_SIGNUP_OTP_TYPE,"otp")).toBe(true);
    expect(allowsOtpPurpose(PLATFORM_SIGNUP_OTP_TYPE,"SIGNUP")).toBe(true);
    for(const purpose of ["CUT_CLUB_SIGNUP","LOGIN","PHONE_CHANGE","OTHER"])expect(allowsOtpPurpose(PLATFORM_SIGNUP_OTP_TYPE,purpose)).toBe(false);
    expect(allowsExternalIntegration("DRVO_ERP","erp")).toBe(true);
    expect(allowsExternalIntegration("DRVO_ERP","otp")).toBe(true);
    expect(allowsOtpPurpose("DRVO_ERP","CUT_CLUB_SIGNUP")).toBe(true);
    expect(allowsExternalIntegration("OTHER","otp")).toBe(false);
  });
  it("requires privileged active business and stores only a scoped hash",()=>{
    const route=readFileSync("src/app/api/integrations/signup-otp/route.ts","utf8");
    const service=readFileSync("src/modules/integrations/signup-otp-key.ts","utf8");
    expect(route).toContain('requireBusinessRole(user.userId,businessId,["OWNER","ADMIN"])');
    expect(route).toContain('"Cache-Control":"no-store"');
    expect(service).toContain("hashIntegrationApiKey(key)");
    expect(service).toContain("target.BusinessID=source.BusinessID AND target.Type=source.Type");
    expect(service).toContain("WHERE BusinessID=@businessId AND Type=@type");
    expect(service).not.toContain("SecretCiphertext");
    const auth=readFileSync("src/modules/integrations/service.ts","utf8");
    expect(auth).toContain('scope: ExternalIntegrationScope = "erp"');
    expect(auth).toContain("allowsExternalIntegration(integration.type, scope)");
    for(const action of ["send","verify"]){
      const endpoint=readFileSync("src/app/api/external/v1/otp/"+action+"/route.ts","utf8");
      expect(endpoint).toContain('request.headers.get("authorization"), "otp"');
      expect(endpoint).toContain("allowsOtpPurpose(integration.type, body.purpose)");
    }
  });
  it("consumes UNKNOWN legacy challenges once and rejects UNKNOWN on platform keys",()=>{
    const service=readFileSync("src/modules/otp/service.ts","utf8");
    expect(service).toContain("params.integration.type === PLATFORM_SIGNUP_OTP_TYPE");
    expect(service).toContain("WHERE ChallengeID = @challengeId AND Status IN (N'SENT', N'UNKNOWN')");
    expect(service).toContain("THEN N'LOCKED' ELSE Status END");
  });
});
