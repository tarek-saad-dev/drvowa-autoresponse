import { redirect } from "next/navigation";

import { EmployeeStudio } from "@/components/dashboard/employee-studio";
import { resolveActiveBusiness } from "@/lib/tenancy/active-business";
import { requireAuthenticatedUser } from "@/lib/tenancy/require-user";
import { getWhatsAppAiSetting } from "@/modules/ai";
import { listAgents } from "@/modules/agents/service";
import { getWhatsAppConnectionView } from "@/modules/channels/whatsapp-service";
import { listItems } from "@/modules/knowledge/service";

export default async function AgentPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const user = await requireAuthenticatedUser();
  const businessId = await resolveActiveBusiness(user.userId, user.activeBusinessId);
  if (!businessId) redirect("/onboarding");

  const [agents, setting, waView, knowledge] = await Promise.all([
    listAgents({ businessId }),
    getWhatsAppAiSetting({ businessId }),
    Promise.race([
      getWhatsAppConnectionView({ businessId }),
      new Promise<null>((resolve) => {
        setTimeout(() => resolve(null), 3_000);
      }),
    ]).catch(() => null),
    listItems({ businessId, includeInactive: false }),
  ]);

  const { tab } = await searchParams;

  return (
    <EmployeeStudio
      businessId={businessId}
      initialAgents={agents}
      initialSetting={
        setting
          ? { agentId: setting.agentId, autoReplyEnabled: setting.autoReplyEnabled }
          : null
      }
      whatsappState={waView?.uiState ?? "UNKNOWN"}
      knowledgeCount={knowledge.length}
      initialTab={tab === "knowledge" ? "knowledge" : "personality"}
    />
  );
}
