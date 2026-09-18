import { withTransaction } from "@/lib/db";
import {
  ForbiddenError,
  NotFoundError,
} from "@/lib/tenancy/errors";
import { maybeScheduleAiReplyAfterInbound } from "@/modules/ai/schedule";
import type { ConversationListItem, Message } from "@/types/domain";

import {
  derivePhoneNormalized,
  normalizeInboundContent,
  parseOptionalUtc,
  type InboundWhatsAppDto,
} from "./content";
import * as repo from "./repository";

export type IngestOutcome =
  | {
      outcome: "accepted";
      messageId: string;
      conversationId: string;
      contactId: string;
      businessId: string;
    }
  | {
      outcome: "duplicate";
      messageId: string;
      conversationId: string;
      contactId: string;
      businessId: string;
    }
  | {
      outcome: "ignored";
      reason:
        | "from_me"
        | "group"
        | "not_live_notify"
        | "inactive_connection";
    };

const USAGE_EVENT = "WHATSAPP_INBOUND_MESSAGE";

/**
 * Idempotent inbound ingest. BusinessID is resolved server-side from accountKey.
 */
export async function ingestWhatsAppInbound(
  dto: InboundWhatsAppDto,
): Promise<IngestOutcome> {
  if (dto.fromMe) {
    return { outcome: "ignored", reason: "from_me" };
  }
  if (dto.isGroup) {
    return { outcome: "ignored", reason: "group" };
  }
  if (dto.upsertType.toLowerCase() !== "notify") {
    return { outcome: "ignored", reason: "not_live_notify" };
  }

  const connection = await repo.resolveChannelByExternalAccountKey(
    dto.accountKey,
  );
  if (!connection) {
    throw new NotFoundError("Unknown WhatsApp account");
  }

  if (
    !connection.isActive
    || connection.status === "INACTIVE"
    || connection.status === "DISCONNECTED"
  ) {
    return { outcome: "ignored", reason: "inactive_connection" };
  }

  const businessId = connection.businessId;
  const channelConnectionId = connection.channelConnectionId;
  const normalized = normalizeInboundContent(dto.content);
  const phoneNormalized = derivePhoneNormalized(dto.externalContactKey);
  const providerTimestampUtc = parseOptionalUtc(dto.messageTimestamp);
  const receivedAtUtc =
    parseOptionalUtc(dto.receivedAt) ?? new Date();
  const messageAt = providerTimestampUtc ?? receivedAtUtc;

  return withTransaction(async (trx) => {
    const contact = await repo.upsertContact(
      {
        businessId,
        channelConnectionId,
        externalContactKey: dto.externalContactKey,
        phoneNormalized,
      },
      trx,
    );

    const conversation = await repo.upsertOpenConversation(
      {
        businessId,
        channelConnectionId,
        contactId: contact.contactId,
      },
      trx,
    );

    const { message, inserted } = await repo.insertMessageIdempotent(
      {
        businessId,
        conversationId: conversation.conversationId,
        channelConnectionId,
        contactId: contact.contactId,
        direction: "INBOUND",
        provider: "baileys",
        providerMessageId: dto.providerMessageId,
        contentType: normalized.contentType,
        textContent: normalized.textContent,
        providerTimestampUtc,
        receivedAtUtc,
      },
      trx,
    );

    if (!inserted) {
      return {
        outcome: "duplicate" as const,
        messageId: message.messageId,
        conversationId: conversation.conversationId,
        contactId: contact.contactId,
        businessId,
      };
    }

    await repo.touchConversationInbound(
      {
        businessId,
        conversationId: conversation.conversationId,
        at: messageAt,
      },
      trx,
    );

    await repo.insertUsageEventInTrx(
      {
        businessId,
        eventType: USAGE_EVENT,
        quantity: 1,
        occurredAtUtc: receivedAtUtc,
        metadata: {
          channelConnectionId,
          conversationId: conversation.conversationId,
          providerMessageId: dto.providerMessageId,
          messageId: message.messageId,
        },
      },
      trx,
    );

    await maybeScheduleAiReplyAfterInbound(
      {
        businessId,
        channelConnectionId,
        conversationId: conversation.conversationId,
        contactId: contact.contactId,
        triggerMessageId: message.messageId,
        contentType: normalized.contentType,
        messageReceivedAt: receivedAtUtc,
      },
      trx,
    );

    return {
      outcome: "accepted" as const,
      messageId: message.messageId,
      conversationId: conversation.conversationId,
      contactId: contact.contactId,
      businessId,
    };
  });
}

export async function listInboxConversations(params: {
  businessId: string;
  limit?: number;
}): Promise<ConversationListItem[]> {
  return repo.listConversationsForBusiness(params);
}

export async function listInboxMessages(params: {
  businessId: string;
  conversationId: string;
  limit?: number;
  before?: {
    at: Date;
    createdAtUtc: Date;
    messageId: string;
  } | null;
}): Promise<Message[]> {
  const conversation = await repo.getConversationForBusiness({
    businessId: params.businessId,
    conversationId: params.conversationId,
  });
  if (!conversation) {
    throw new NotFoundError("Conversation not found");
  }
  // Defense-in-depth: never leak cross-tenant by id alone
  if (conversation.businessId !== params.businessId) {
    throw new ForbiddenError("Conversation access denied");
  }
  return repo.listMessagesForConversation({
    businessId: params.businessId,
    conversationId: params.conversationId,
    limit: params.limit,
    before: params.before ?? null,
  });
}

export { resolveChannelByExternalAccountKey } from "./repository";
