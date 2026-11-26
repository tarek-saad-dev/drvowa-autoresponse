import { redirect } from "next/navigation";

import { IntegrationManager } from "@/components/dashboard/integration-manager";
import { SignupOtpKeyPanel } from "@/components/dashboard/signup-otp-key-panel";
import { requireBusinessMembership } from "@/lib/tenancy/require-membership";
import { PLATFORM_SIGNUP_OTP_TYPE } from "@/modules/integrations/otp-scope";
import { resolveActiveBusiness } from "@/lib/tenancy/active-business";
import { requireAuthenticatedUser } from "@/lib/tenancy/require-user";
import { listIntegrations } from "@/modules/integrations/service";

export default async function IntegrationsPage() {
  const user = await requireAuthenticatedUser();
  const businessId = await resolveActiveBusiness(
    user.userId,
    user.activeBusinessId,
  );
  if (!businessId) redirect("/onboarding");

  const integrations = await listIntegrations({ businessId });
  const drvoErp = integrations.find((item) => item.type === "DRVO_ERP") ?? null;
  const membership=await requireBusinessMembership(user.userId,businessId);
  const otp=integrations.find(item=>item.type===PLATFORM_SIGNUP_OTP_TYPE);
  const canManageOtp=membership.role==="OWNER"||membership.role==="ADMIN";

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-black text-primary">التكاملات</p>
        <h1 className="mt-1 text-3xl font-black tracking-[-0.035em]">
          اربط DRVOWA بالسيستم اللي بيشغل البيزنس
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-7 text-muted-foreground">
          Events من الـ ERP تتحول لرسائل واتساب، وTools تسمح للـ AI يقرأ بيانات حية وينفذ إجراءات بشكل محكوم.
        </p>
      </div>

      {canManageOtp&&<SignupOtpKeyPanel initialActive={otp?.status==="ACTIVE"&&!!otp.inboundApiKeyHash}/>}
      <IntegrationManager
        initialIntegration={
          drvoErp
            ? {
                integrationId: drvoErp.integrationId,
                type: drvoErp.type,
                status: drvoErp.status,
                externalReference: drvoErp.externalReference,
                baseUrl: drvoErp.baseUrl,
                capabilitiesJson: drvoErp.capabilitiesJson,
                lastHealthAtUtc: drvoErp.lastHealthAtUtc,
                lastHealthStatus: drvoErp.lastHealthStatus,
              }
            : null
        }
      />
    </div>
  );
}
