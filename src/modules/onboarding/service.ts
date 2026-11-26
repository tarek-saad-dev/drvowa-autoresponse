import { KNOWLEDGE_CATEGORIES } from "@/constants/knowledge";
import { DbError } from "@/lib/db";
import { setSessionActiveBusiness } from "@/modules/auth/session";
import { writeAuditEvent } from "@/modules/audit/service";
import { createAgent, listAgents } from "@/modules/agents/service";
import {
  createBusiness,
  listBusinessesForUser,
  updateBusiness,
} from "@/modules/businesses/service";
import {
  createItem,
  ensureDefaultKnowledgeBase,
} from "@/modules/knowledge/service";
import { createLocation } from "@/modules/locations/service";
import type {
  Agent,
  Business,
  KnowledgeItem,
  Location,
  Subscription,
} from "@/types/domain";
import { ensureDefaultSubscription } from "@/modules/billing/service";

/** Log the failing setup step without logging request payloads, credentials or SQL values. */
async function onboardingStage<T>(stage: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const reason = /could not find stored procedure/i.test(message) ? "MISSING_PROCEDURE"
      : /invalid object name/i.test(message) ? "MISSING_TABLE"
      : /invalid column name/i.test(message) ? "MISSING_COLUMN"
      : /deadlock/i.test(message) ? "DEADLOCK"
      : /timeout|timed out/i.test(message) ? "TIMEOUT"
      : /constraint|duplicate key/i.test(message) ? "CONSTRAINT"
      : /cannot insert the value null/i.test(message) ? "NULL_VALUE"
      : "UNKNOWN";
    console.error("[onboarding] workspace_stage_failed", {
      stage,
      reason,
      name: error instanceof Error ? error.name : "UnknownError",
      code: error instanceof DbError ? error.code : undefined,
    });
    throw error;
  }
}

export type CompleteOnboardingInput = {
  userId: string;
  sessionId?: string;
  business: {
    name: string;
    category: string;
    countryCode: string;
    locale: string;
    timezone: string;
  };
  location?: {
    name: string;
    code?: string | null;
    timezone?: string | null;
    addressLine?: string | null;
    city?: string | null;
    phone?: string | null;
  } | null;
  agent: {
    name: string;
    roleTitle?: string;
    language?: string;
    dialect?: string | null;
    tone?: string | null;
    instructions?: string | null;
  };
  knowledgeItems?: Array<{
    category?: (typeof KNOWLEDGE_CATEGORIES)[keyof typeof KNOWLEDGE_CATEGORIES];
    title: string;
    content: string;
  }>;
};

export type CompleteOnboardingResult = {
  business: Business;
  location: Location | null;
  agent: Agent;
  knowledgeItems: KnowledgeItem[];
  subscription: Subscription;
};

export async function completeOnboarding(
  input: CompleteOnboardingInput,
): Promise<CompleteOnboardingResult> {
  const business = await onboardingStage("create_business_and_subscription", () => createBusiness({
    ownerUserId: input.userId,
    name: input.business.name,
    category: input.business.category,
    countryCode: input.business.countryCode,
    locale: input.business.locale,
    timezone: input.business.timezone,
  }));

  const sessionId = input.sessionId;
  if (sessionId) {
    await onboardingStage("set_active_business", () => setSessionActiveBusiness({
      sessionId,
      activeBusinessId: business.businessId,
    }));
  }

  // Entitlements require a current FREE subscription before Agent/Knowledge.
  const subscription = await onboardingStage("ensure_subscription", () => ensureDefaultSubscription({
    businessId: business.businessId,
  }));

  // ensureDefaultSubscription owns initial trial enrollment atomically.
  // Do not invoke the trial procedure again here.

  let location: Location | null = null;
  if (input.location?.name?.trim()) {
    location = await createLocation({
      businessId: business.businessId,
      name: input.location.name,
      code: input.location.code,
      timezone: input.location.timezone ?? input.business.timezone,
      addressLine: input.location.addressLine,
      city: input.location.city,
      phone: input.location.phone,
    });
  }

  const agent = await onboardingStage("create_agent", () => createAgent({
    businessId: business.businessId,
    name: input.agent.name.trim() || "موظف الاستقبال",
    roleTitle: input.agent.roleTitle?.trim() || "موظف استقبال",
    language: input.agent.language?.trim() || "ar",
    dialect: input.agent.dialect ?? null,
    tone: input.agent.tone ?? null,
    instructions: input.agent.instructions ?? null,
  }));

  await onboardingStage("ensure_knowledge_base", () => ensureDefaultKnowledgeBase({ businessId: business.businessId }));

  const seedItems =
    input.knowledgeItems && input.knowledgeItems.length > 0
      ? input.knowledgeItems
      : [
          {
            category: KNOWLEDGE_CATEGORIES.ABOUT,
            title: "عن النشاط",
            content: `${business.name} يستخدم DRVOWA كموظف استقبال ذكي عبر واتساب.`,
          },
          {
            category: KNOWLEDGE_CATEGORIES.FAQ,
            title: "ساعات العمل",
            content:
              "أضف هنا ساعات العمل ليتمكن موظف الاستقبال من إجابة العملاء.",
          },
        ];

  const knowledgeItems: KnowledgeItem[] = [];
  for (const item of seedItems) {
    knowledgeItems.push(
      await onboardingStage("create_knowledge_item", () => createItem({
        businessId: business.businessId,
        category: item.category ?? KNOWLEDGE_CATEGORIES.CUSTOM,
        title: item.title,
        content: item.content,
      })),
    );
  }

  const completedBusiness = await onboardingStage("mark_completed", () => updateBusiness({
    businessId: business.businessId,
    onboardingCompletedAtUtc: new Date(),
  }));

  await writeAuditEvent({
    businessId: business.businessId,
    actorUserId: input.userId,
    action: "onboarding.complete",
    entityType: "Business",
    entityId: business.businessId,
    metadata: {
      hasLocation: Boolean(location),
      agentId: agent.agentId,
      knowledgeItemCount: knowledgeItems.length,
    },
  });

  return {
    business: completedBusiness,
    location,
    agent,
    knowledgeItems,
    subscription,
  };
}

/**
 * Repairs a partially-created onboarding workspace (e.g. business existed but
 * FREE subscription insert failed). Safe to call repeatedly.
 */
export async function ensureOnboardingWorkspace(params: {
  userId: string;
  sessionId?: string;
  agent?: Partial<CompleteOnboardingInput["agent"]>;
}): Promise<{
  business: Business;
  agent: Agent;
  subscription: Subscription;
}> {
  const businesses = await onboardingStage("list_existing_businesses", () => listBusinessesForUser(params.userId));
  const business = businesses[0];
  if (!business) {
    throw new Error("NO_BUSINESS");
  }

  const sessionId = params.sessionId;
  if (sessionId) {
    await onboardingStage("set_active_business", () => setSessionActiveBusiness({
      sessionId,
      activeBusinessId: business.businessId,
    }));
  }

  const subscription = await onboardingStage("ensure_subscription", () => ensureDefaultSubscription({
    businessId: business.businessId,
  }));
  await onboardingStage("ensure_knowledge_base", () => ensureDefaultKnowledgeBase({ businessId: business.businessId }));

  const agents = await onboardingStage("list_agents", () => listAgents({ businessId: business.businessId }));
  let agent = agents.find((item) => item.isActive) ?? agents[0] ?? null;
  if (!agent) {
    agent = await onboardingStage("repair_agent", () => createAgent({
      businessId: business.businessId,
      name: params.agent?.name?.trim() || "موظف الاستقبال",
      roleTitle: params.agent?.roleTitle?.trim() || "موظف استقبال",
      language: params.agent?.language?.trim() || "ar",
      dialect: params.agent?.dialect ?? "مصري",
      tone: params.agent?.tone ?? "مهني وودود",
      instructions:
        params.agent?.instructions
        ?? "جاوب باختصار ووضوح وبناءً على معلومات النشاط فقط.",
    }));
  }

  return { business, agent, subscription };
}
