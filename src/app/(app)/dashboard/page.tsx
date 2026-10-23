import { redirect } from "next/navigation";

import { DailyActivitySummary } from "@/components/dashboard/overview/daily-activity";
import { HumanInterventionBanner } from "@/components/dashboard/overview/human-intervention-banner";
import {
  RecentConversations,
  type OverviewConversation,
} from "@/components/dashboard/overview/recent-conversations";
import { ReceptionistStatusCard } from "@/components/dashboard/overview/receptionist-status-card";
import { TeachShortcut } from "@/components/dashboard/overview/teach-shortcut";
import { isMissingObjectError } from "@/lib/db";
import { deriveReceptionistStatus } from "@/lib/dashboard/receptionist-status";
import { resolveActiveBusiness } from "@/lib/tenancy/active-business";
import { requireAuthenticatedUser } from "@/lib/tenancy/require-user";
import { listAgents } from "@/modules/agents/service";
import { getWhatsAppAiSetting } from "@/modules/ai";
import { getBusinessById } from "@/modules/businesses/service";
import { findWhatsAppConnection } from "@/modules/channels/repository";
import { countOpenEscalations } from "@/modules/escalations/service";
import { listItems } from "@/modules/knowledge/service";
import {
  getDashboardDailyActivity,
  listInboxConversations,
} from "@/modules/messaging";

function conversationStatusMeta(conversation: {
  aiMode: string | null | undefined;
  aiReplyHealth: { state: string } | null | undefined;
}): Pick<OverviewConversation, "statusLabel" | "statusTone"> {
  if (conversation.aiMode === "SAFETY_PAUSED") {
    return { statusLabel: "محتاج مراجعة", statusTone: "attention" };
  }
  if (conversation.aiMode === "HUMAN_PAUSED") {
    return { statusLabel: "مع الفريق", statusTone: "attention" };
  }
  const health = conversation.aiReplyHealth?.state;
  if (health === "DISABLED" || health === "FAILED") {
    return { statusLabel: "محتاج تدخل", statusTone: "attention" };
  }
  if (health === "REPLYING") {
    return { statusLabel: "بيجهّز رد", statusTone: "neutral" };
  }
  return { statusLabel: null, statusTone: "ok" };
}

export default async function DashboardOverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;
  const user = await requireAuthenticatedUser();
  const businessId = await resolveActiveBusiness(
    user.userId,
    user.activeBusinessId,
  );

  if (!businessId) {
    redirect("/onboarding");
  }

  const [
    business,
    agents,
    knowledgeItems,
    wa,
    aiSetting,
    conversations,
  ] = await Promise.all([
    getBusinessById({ businessId }),
    listAgents({ businessId }),
    listItems({ businessId }),
    findWhatsAppConnection({ businessId }),
    getWhatsAppAiSetting({ businessId }),
    listInboxConversations({ businessId, limit: 8 }),
  ]);

  let openEscalations = 0;
  let openEscalationsAvailable = true;
  try {
    openEscalations = await countOpenEscalations(businessId);
  } catch (error) {
    if (!isMissingObjectError(error)) throw error;
    openEscalationsAvailable = false;
    openEscalations = 0;
  }

  let dailyActivity: Awaited<ReturnType<typeof getDashboardDailyActivity>> = null;
  try {
    dailyActivity = await getDashboardDailyActivity({ businessId });
  } catch (error) {
    if (!isMissingObjectError(error)) throw error;
    dailyActivity = null;
  }

  const waActive = wa?.status === "ACTIVE";
  const aiOn = Boolean(aiSetting?.autoReplyEnabled);
  const activeKnowledge = knowledgeItems.filter((item) => item.isActive).length;
  const activeAgent = agents.find((agent) => agent.isActive) ?? agents[0] ?? null;

  const status = deriveReceptionistStatus({
    businessName: business.name,
    whatsappStatus: wa?.status,
    autoReplyEnabled: aiOn,
    hasActiveAgent: Boolean(activeAgent),
    hasActiveKnowledge: activeKnowledge > 0,
  });

  const recent: OverviewConversation[] = conversations.map((conversation) => {
    const meta = conversationStatusMeta(conversation);
    return {
      conversationId: conversation.conversationId,
      contactDisplayName: conversation.contactDisplayName,
      contactPhoneNormalized: conversation.contactPhoneNormalized,
      lastMessagePreview: conversation.lastMessagePreview,
      lastMessageAtUtc: conversation.lastMessageAtUtc,
      unread: conversation.unread,
      statusLabel: meta.statusLabel,
      statusTone: meta.statusTone,
    };
  });

  const showIntervention = openEscalationsAvailable && openEscalations > 0;
  const showTeach = status.kind === "working" || status.kind === "ai_paused";

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5 sm:space-y-6">
      <ReceptionistStatusCard status={status} />

      {showIntervention ? (
        <HumanInterventionBanner count={openEscalations} />
      ) : null}

      <RecentConversations
        conversations={recent}
        whatsappConnected={waActive}
      />

      <DailyActivitySummary activity={dailyActivity} />

      {showTeach ? <TeachShortcut /> : null}

      {params.next === "whatsapp" ? (
        <p className="rounded-xl border border-primary/15 bg-primary/5 px-4 py-3 text-sm font-bold text-primary">
          تم حفظ الإعداد. الخطوة التالية: اربط واتساب وجرّب أول رسالة.
        </p>
      ) : null}
    </div>
  );
}
