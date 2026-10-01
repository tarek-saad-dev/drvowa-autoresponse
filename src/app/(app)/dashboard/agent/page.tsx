import { AiAutoReplyPanel } from "@/components/dashboard/ai-auto-reply-panel";
import { AgentsManager } from "@/components/dashboard/agents-manager";
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
    <div className="space-y-6">
      <div>
        <p className="text-xs font-black text-primary">شخصية الموظف</p>
        <h1 className="mt-1 text-3xl font-black tracking-[-0.035em]">ظبّط موظف الاستقبال بطريقتك</h1>
        <p className="mt-2 max-w-2xl text-sm leading-7 text-muted-foreground">
          اختار شخصيته وطريقة كلامه، وبعدها شغّل أو وقف الرد التلقائي وقت ما تحب.
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
        whatsapp={{
          uiState: waView?.uiState ?? "NOT_CONNECTED",
          maskedPhone: waView?.connection?.maskedPhone ?? null,
        }}
        knowledgeActiveCount={knowledge.length}
      />
      <AgentsManager agents={agents} />
    </div>
  );
}
