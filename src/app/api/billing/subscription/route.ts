import { requireApiBusiness } from "@/lib/api/auth-context";
import { handleApiError, jsonOk } from "@/lib/api/http";
import { getBillingOverview } from "@/modules/billing/service";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const queryBusinessId = url.searchParams.get("businessId");
    const { businessId } = await requireApiBusiness({
      businessId: queryBusinessId,
    });
    const overview = await getBillingOverview({ businessId });
    return jsonOk({
      subscription: overview.subscription,
      plan: overview.plan
        ? {
            planId: overview.plan.planId,
            code: overview.plan.code,
            displayName: overview.plan.displayName,
            status: overview.plan.status,
            limits: {
              maxWhatsAppConnections: overview.plan.maxWhatsAppConnections,
              maxAgents: overview.plan.maxAgents,
              maxActiveKnowledgeItems: overview.plan.maxActiveKnowledgeItems,
              monthlyAiReplies: overview.plan.monthlyAiReplies,
              monthlyWhatsAppOutbound: overview.plan.monthlyWhatsAppOutbound,
            },
          }
        : null,
      usagePeriod: {
        usagePeriodStartUtc: overview.usagePeriod.usagePeriodStartUtc,
        usagePeriodEndUtc: overview.usagePeriod.usagePeriodEndUtc,
      },
      usage: {
        aiReplies: overview.aiUsed,
        whatsappOutbound: overview.whatsappOutboundUsed,
        whatsappConnections: overview.whatsappConnectionsUsed,
        agents: overview.agentsUsed,
        activeKnowledgeItems: overview.activeKnowledgeUsed,
      },
      canAct: overview.canAct,
      blockReason: overview.blockReason,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
