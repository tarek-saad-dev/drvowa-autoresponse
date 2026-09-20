import { withTransaction } from "@/lib/db";
import { NotFoundError } from "@/lib/tenancy/errors";
import { pauseConversationAi } from "@/modules/ai/conversation-state-repository";
import {
  consumeQuotaReservation,
  markQuotaReservationUncertain,
  releaseQuotaReservation,
  reserveQuota,
} from "@/modules/billing/entitlements";
import { isPlanEntitlementError } from "@/modules/billing/errors";
import {
  USAGE_EVENT_WHATSAPP_OUTBOUND,
  manualWaIdempotencyKey,
  manualWaOutboundReservationKey,
} from "@/modules/billing/period";
import { getChannelConnection } from "@/modules/channels/repository";
import {
  sendAccountMessage,
  WhatsAppRuntimeError,
} from "@/modules/channels/runtime-client";
import * as messagingRepo from "@/modules/messaging/repository";

const MAX_MANUAL_TEXT_CHARS = 4000;

export type ManualReplyResult =
  | {
      status: "SENT" | "DUPLICATE";
      messageId: string;
      providerMessageId: string;
      aiPaused: true;
    }
  | {
      status: "AMBIGUOUS";
      errorCode: string;
    }
  | {
      status: "FAILED";
      errorCode: string;
    };

/**
 * Operator manual WhatsApp reply. Resolves accountKey server-side.
 * Reserves WA outbound quota, sends with durable idempotency, persists message,
 * consumes quota, and pauses AI (HUMAN_TAKEOVER).
 */
export async function sendManualInboxReply(params: {
  businessId: string;
  conversationId: string;
  text: string;
  /** Client-generated UUID — stable across retries of the same send. */
  idempotencyKey: string;
}): Promise<ManualReplyResult> {
  const text = params.text.trim();
  if (!text) {
    throw new Error("EMPTY_MESSAGE");
  }
  if (text.length > MAX_MANUAL_TEXT_CHARS) {
    throw new Error("MESSAGE_TOO_LONG");
  }
  const idempotencyKey = params.idempotencyKey.trim();
  if (!idempotencyKey || idempotencyKey.length > 80) {
    throw new Error("INVALID_IDEMPOTENCY_KEY");
  }

  const conversation = await messagingRepo.getConversationForBusiness({
    businessId: params.businessId,
    conversationId: params.conversationId,
  });
  if (!conversation) {
    throw new NotFoundError("Conversation not found");
  }

  const contact = await messagingRepo.getContactForBusiness({
    businessId: params.businessId,
    contactId: conversation.contactId,
  });
  if (!contact?.phoneNormalized) {
    throw new Error("DESTINATION_UNAVAILABLE");
  }

  const connection = await getChannelConnection({
    businessId: params.businessId,
    channelConnectionId: conversation.channelConnectionId,
  });
  const accountKey = connection?.externalAccountKey;
  if (!accountKey) {
    throw new Error("ACCOUNT_KEY_MISSING");
  }

  const reservationKey = manualWaOutboundReservationKey(idempotencyKey);
  const runtimeIdempotencyKey = manualWaIdempotencyKey(idempotencyKey);

  let releaseEligible = false;
  let held = false;
  try {
    const reserved = await reserveQuota({
      businessId: params.businessId,
      eventType: USAGE_EVENT_WHATSAPP_OUTBOUND,
      reservationKey,
    });
    held =
      reserved.state === "RESERVED" || reserved.state === "UNCERTAIN";
    releaseEligible =
      reserved.state === "RESERVED" && reserved.idempotent === false;
  } catch (error) {
    if (isPlanEntitlementError(error)) {
      return { status: "FAILED", errorCode: error.code };
    }
    throw error;
  }

  let sendResult;
  try {
    sendResult = await sendAccountMessage({
      accountKey,
      phone: contact.phoneNormalized,
      message: text,
      idempotencyKey: runtimeIdempotencyKey,
    });
  } catch (error) {
    if (error instanceof WhatsAppRuntimeError) {
      const ambiguous =
        error.code === "OUTBOUND_RESULT_UNKNOWN"
        || error.code === "RUNTIME_TIMEOUT"
        || error.code === "RUNTIME_UNAVAILABLE";
      if (ambiguous) {
        if (held) {
          await markQuotaReservationUncertain({
            businessId: params.businessId,
            eventType: USAGE_EVENT_WHATSAPP_OUTBOUND,
            reservationKey,
          });
        }
        return { status: "AMBIGUOUS", errorCode: error.code };
      }
      const definitive =
        error.code === "NOT_READY"
        || error.code === "LOGGED_OUT"
        || error.code === "NOT_STARTED"
        || error.code === "IDEMPOTENCY_CONFLICT"
        || error.status === 409;
      if (definitive && releaseEligible) {
        await releaseQuotaReservation({
          businessId: params.businessId,
          eventType: USAGE_EVENT_WHATSAPP_OUTBOUND,
          reservationKey,
        });
      } else if (!definitive && held) {
        await markQuotaReservationUncertain({
          businessId: params.businessId,
          eventType: USAGE_EVENT_WHATSAPP_OUTBOUND,
          reservationKey,
        });
        return { status: "AMBIGUOUS", errorCode: error.code };
      }
      return { status: "FAILED", errorCode: error.code };
    }
    throw error;
  }

  const statusLower = (sendResult.status ?? "").toLowerCase();
  const isDuplicate = statusLower === "duplicate";
  const isSent = statusLower === "sent" || sendResult.success;

  if (sendResult.code === "OUTBOUND_RESULT_UNKNOWN") {
    if (held) {
      await markQuotaReservationUncertain({
        businessId: params.businessId,
        eventType: USAGE_EVENT_WHATSAPP_OUTBOUND,
        reservationKey,
      });
    }
    return { status: "AMBIGUOUS", errorCode: "OUTBOUND_RESULT_UNKNOWN" };
  }

  if ((!isSent && !isDuplicate) || !sendResult.messageId) {
    if (releaseEligible) {
      await releaseQuotaReservation({
        businessId: params.businessId,
        eventType: USAGE_EVENT_WHATSAPP_OUTBOUND,
        reservationKey,
      });
    }
    return {
      status: "FAILED",
      errorCode: sendResult.code || "SEND_FAILED",
    };
  }

  const providerMessageId = String(
    sendResult.originalMessageId ?? sendResult.messageId,
  );
  const sentAt = new Date();

  let messageId = "";
  await withTransaction(async (trx) => {
    const { message } = await messagingRepo.insertMessageIdempotent(
      {
        businessId: params.businessId,
        conversationId: params.conversationId,
        channelConnectionId: conversation.channelConnectionId,
        contactId: conversation.contactId,
        direction: "OUTBOUND",
        provider: "baileys",
        providerMessageId,
        contentType: "TEXT",
        textContent: text,
        providerTimestampUtc: sentAt,
        receivedAtUtc: sentAt,
      },
      trx,
    );
    messageId = message.messageId;
    await messagingRepo.touchConversationOutbound(
      {
        businessId: params.businessId,
        conversationId: params.conversationId,
        at: sentAt,
      },
      trx,
    );
    await consumeQuotaReservation({
      businessId: params.businessId,
      eventType: USAGE_EVENT_WHATSAPP_OUTBOUND,
      reservationKey,
      metadata: {
        source: "manual_inbox",
        conversationId: params.conversationId,
        providerMessageId,
      },
      trx,
    });
    await pauseConversationAi(
      {
        businessId: params.businessId,
        conversationId: params.conversationId,
        mode: "HUMAN_PAUSED",
        pauseReason: "HUMAN_TAKEOVER",
        pausedAtUtc: sentAt,
        lastHumanOutboundProviderMessageId: providerMessageId,
      },
      trx,
    );
  });

  return {
    status: isDuplicate ? "DUPLICATE" : "SENT",
    messageId,
    providerMessageId,
    aiPaused: true,
  };
}
