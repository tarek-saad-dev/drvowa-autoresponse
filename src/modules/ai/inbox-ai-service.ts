import { NotFoundError, ForbiddenError } from "@/lib/tenancy/errors";
import * as messagingRepo from "@/modules/messaging/repository";
import type { ConversationAiState } from "@/types/domain";

import {
  getEffectiveConversationAiState,
  pauseConversationAi,
  resumeConversationAi,
} from "./conversation-state-repository";

async function assertConversationOwned(params: {
  businessId: string;
  conversationId: string;
}) {
  const conversation = await messagingRepo.getConversationForBusiness({
    businessId: params.businessId,
    conversationId: params.conversationId,
  });
  if (!conversation) {
    throw new NotFoundError("Conversation not found");
  }
  if (conversation.businessId !== params.businessId) {
    throw new ForbiddenError("Conversation access denied");
  }
  return conversation;
}

export async function getInboxConversationAiState(params: {
  businessId: string;
  conversationId: string;
}): Promise<ConversationAiState> {
  await assertConversationOwned(params);
  return getEffectiveConversationAiState(params);
}

export async function resumeInboxConversationAi(params: {
  businessId: string;
  conversationId: string;
}): Promise<ConversationAiState> {
  await assertConversationOwned(params);
  return resumeConversationAi(params);
}

export async function pauseInboxConversationAi(params: {
  businessId: string;
  conversationId: string;
}): Promise<ConversationAiState> {
  await assertConversationOwned(params);
  return pauseConversationAi({
    businessId: params.businessId,
    conversationId: params.conversationId,
    mode: "HUMAN_PAUSED",
    pauseReason: "MANUAL_PAUSE",
  });
}
