import { AgentWorkspace } from "@/components/dashboard/agent-workspace";
import { resolveActiveBusiness } from "@/lib/tenancy/active-business";
import { requireAuthenticatedUser } from "@/lib/tenancy/require-user";
import { getWhatsAppAiSetting } from "@/modules/ai";
import { listAgents } from "@/modules/agents/service";
import { getWhatsAppConnectionView } from "@/modules/channels/whatsapp-service";
import { listItems } from "@/modules/knowledge/service";
import { redirect } from "next/navigation";

export default async function AgentPage() {
  const user = await requireAuthenticatedUser();
  const businessId = await resolveActiveBusiness(
    user.userId,
    user.activeBusinessId,
  );
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

  const activeAgents = agents.filter((a) => a.isActive);

  return (
    <AgentWorkspace
      agents={agents}
      activeAgents={activeAgents.map((a) => ({
        agentId: a.agentId,
        name: a.name,
        roleTitle: a.roleTitle,
        isActive: a.isActive,
        language: a.language,
        dialect: a.dialect,
        tone: a.tone,
      }))}
      initialSetting={
        setting
          ? {
              channelAiSettingId: setting.channelAiSettingId,
              channelConnectionId: setting.channelConnectionId,
              agentId: setting.agentId,
              autoReplyEnabled: setting.autoReplyEnabled,
              enabledAtUtc: setting.enabledAtUtc,
              debounceMs: setting.debounceMs,
              humanTakeoverResumePolicy: setting.humanTakeoverResumePolicy,
            }
          : null
      }
      whatsapp={{
        uiState: waView?.uiState ?? "NOT_CONNECTED",
        maskedPhone: waView?.connection?.maskedPhone ?? null,
      }}
      knowledgeActiveCount={knowledge.length}
    />
  );
}
