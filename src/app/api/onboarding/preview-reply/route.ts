import { z } from "zod";

import { requireApiBusiness } from "@/lib/api/auth-context";
import { handleApiError, jsonOk, parseJsonBody } from "@/lib/api/http";
import { RATE_LIMITS, assertRateLimit } from "@/lib/security/rate-limit";
import { createGeminiProvider } from "@/modules/ai";
import { listAgents } from "@/modules/agents/service";
import { listItems } from "@/modules/knowledge/service";

const bodySchema = z.object({
  message: z.string().min(1).max(1200),
});

export async function POST(request: Request) {
  try {
    const { businessId } = await requireApiBusiness();
    assertRateLimit(
      `onboarding-preview-reply:${businessId}`,
      RATE_LIMITS.onboardingPreviewReply,
    );

    const body = bodySchema.parse(await parseJsonBody(request));
    const [agents, knowledgeItems] = await Promise.all([
      listAgents({ businessId }),
      listItems({ businessId, includeInactive: false }),
    ]);

    const agent = agents.find((item) => item.isActive) ?? agents[0];
    if (!agent) {
      throw new Error("ONBOARDING_AGENT_MISSING");
    }

    const provider = createGeminiProvider();
    const result = await provider.generateReply({
      businessId,
      conversationId: "onboarding-preview",
      agent: {
        name: agent.name,
        roleTitle: agent.roleTitle,
        language: agent.language,
        dialect: agent.dialect,
        tone: agent.tone,
        instructions: agent.instructions,
      },
      knowledge: knowledgeItems.map((item) => ({
        category: item.category,
        title: item.title,
        content: item.content,
      })),
      recentMessages: [
        {
          messageId: "onboarding-preview-message",
          direction: "INBOUND",
          textContent: body.message,
          createdAtUtc: new Date(),
        },
      ],
      customerPhoneHint: null,
    });

    return jsonOk({
      reply: result.text,
      model: result.model,
      latencyMs: result.latencyMs,
      agentId: agent.agentId,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
