import { redirect } from "next/navigation";

import { IntegrationManager } from "@/components/dashboard/integration-manager";
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
