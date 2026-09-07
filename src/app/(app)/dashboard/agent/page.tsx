import { AgentsManager } from "@/components/dashboard/agents-manager";
import { resolveActiveBusiness } from "@/lib/tenancy/active-business";
import { requireAuthenticatedUser } from "@/lib/tenancy/require-user";
import { listAgents } from "@/modules/agents/service";
import { redirect } from "next/navigation";

export default async function AgentPage() {
  const user = await requireAuthenticatedUser();
  const businessId = await resolveActiveBusiness(
    user.userId,
    user.activeBusinessId,
  );
  if (!businessId) redirect("/onboarding");

  const agents = await listAgents({ businessId });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">الوكيل الذكي</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          إعداد وكيل الاستقبال — بدون تشغيل Gemini أو الردود الآلية بعد.
        </p>
      </div>
      <AgentsManager agents={agents} />
    </div>
  );
}
