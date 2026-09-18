import { AiAutoReplyPanel } from "@/components/dashboard/ai-auto-reply-panel";
import { AgentsManager } from "@/components/dashboard/agents-manager";
import { resolveActiveBusiness } from "@/lib/tenancy/active-business";
import { requireAuthenticatedUser } from "@/lib/tenancy/require-user";
import { getWhatsAppAiSetting } from "@/modules/ai";
import { listAgents } from "@/modules/agents/service";
import { redirect } from "next/navigation";

export default async function AgentPage() {
  const user = await requireAuthenticatedUser();
  const businessId = await resolveActiveBusiness(
    user.userId,
    user.activeBusinessId,
  );
  if (!businessId) redirect("/onboarding");

  const [agents, setting] = await Promise.all([
    listAgents({ businessId }),
    getWhatsAppAiSetting({ businessId }),
  ]);

  const activeAgents = agents.filter((a) => a.isActive);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">الوكيل الذكي</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          إعداد وكيل الاستقبال والرد الآلي على واتساب للرسائل الجديدة فقط.
        </p>
      </div>
      <AiAutoReplyPanel
        initialSetting={
          setting
            ? {
                channelAiSettingId: setting.channelAiSettingId,
                channelConnectionId: setting.channelConnectionId,
                agentId: setting.agentId,
                autoReplyEnabled: setting.autoReplyEnabled,
                enabledAtUtc: setting.enabledAtUtc,
                debounceMs: setting.debounceMs,
              }
            : null
        }
        agents={activeAgents.map((a) => ({
          agentId: a.agentId,
          name: a.name,
          roleTitle: a.roleTitle,
          isActive: a.isActive,
        }))}
      />
      <AgentsManager agents={agents} />
    </div>
  );
}
