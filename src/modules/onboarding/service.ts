import { KNOWLEDGE_CATEGORIES } from "@/constants/knowledge";
import { setSessionActiveBusiness } from "@/modules/auth/session";
import { writeAuditEvent } from "@/modules/audit/service";
import { createAgent } from "@/modules/agents/service";
import {
  createBusiness,
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
  const business = await createBusiness({
    ownerUserId: input.userId,
    name: input.business.name,
    category: input.business.category,
    countryCode: input.business.countryCode,
    locale: input.business.locale,
    timezone: input.business.timezone,
  });

  if (input.sessionId) {
    await setSessionActiveBusiness({
      sessionId: input.sessionId,
      activeBusinessId: business.businessId,
    });
  }

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

  const agent = await createAgent({
    businessId: business.businessId,
    name: input.agent.name.trim() || "AI receptionist",
    roleTitle: input.agent.roleTitle?.trim() || "AI receptionist",
    language: input.agent.language?.trim() || "ar",
    dialect: input.agent.dialect ?? null,
    tone: input.agent.tone ?? null,
    instructions: input.agent.instructions ?? null,
  });

  await ensureDefaultKnowledgeBase({ businessId: business.businessId });

  const seedItems =
    input.knowledgeItems && input.knowledgeItems.length > 0
      ? input.knowledgeItems
      : [
          {
            category: KNOWLEDGE_CATEGORIES.ABOUT,
            title: "About the business",
            content: `${business.name} uses DRVOWA AutoResponse as an AI receptionist.`,
          },
          {
            category: KNOWLEDGE_CATEGORIES.FAQ,
            title: "Working hours",
            content: "Share your opening hours here so the receptionist can answer customers.",
          },
        ];

  const knowledgeItems: KnowledgeItem[] = [];
  for (const item of seedItems) {
    knowledgeItems.push(
      await createItem({
        businessId: business.businessId,
        category: item.category ?? KNOWLEDGE_CATEGORIES.CUSTOM,
        title: item.title,
        content: item.content,
      }),
    );
  }

  const completedBusiness = await updateBusiness({
    businessId: business.businessId,
    onboardingCompletedAtUtc: new Date(),
  });

  const subscription = await ensureDefaultSubscription({
    businessId: business.businessId,
  });

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
