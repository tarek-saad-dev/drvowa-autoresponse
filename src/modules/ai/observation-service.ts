import { z } from "zod";

import { withTransaction } from "@/lib/db";
import { NotFoundError } from "@/lib/tenancy/errors";
import {
  derivePhoneNormalized,
  parseOptionalUtc,
} from "@/modules/messaging/content";
import * as messagingRepo from "@/modules/messaging/repository";

import {
  pauseConversationAi,
} from "./conversation-state-repository";
import { logAiSafety } from "./guard-repository";
import { skipPendingJobsForConversation } from "./jobs-repository";
import {
  findOutboundObservation,
  insertOutboundObservationIdempotent,
} from "./observation-repository";

export const outboundObservedDtoSchema = z
  .object({
    accountKey: z.string().trim().min(1).max(64),
    provider: z.literal("baileys"),
    providerMessageId: z.string().trim().min(1).max(256),
    origin: z.enum(["DRVOWA_API", "HUMAN_MANUAL"]),
    phone: z.string().trim().min(1).max(32).optional().nullable(),
    externalContactKey: z.string().trim().min(1).max(256).optional().nullable(),
    occurredAt: z.union([z.string(), z.number(), z.null()]).optional(),
  })
  .strict();

export type OutboundObservedDto = z.infer<typeof outboundObservedDtoSchema>;

export type OutboundObservedOutcome =
  | {
      outcome: "accepted";
      origin: "DRVOWA_API" | "HUMAN_MANUAL";
      observationId: string;
      conversationId: string | null;
      paused?: boolean;
    }
  | {
      outcome: "duplicate";
      origin: "DRVOWA_API" | "HUMAN_MANUAL";
      observationId: string;
      conversationId: string | null;
    }
  | {
      outcome: "ignored";
      reason: "inactive_connection";
    };

function logObservation(
  event: string,
  fields: Record<string, unknown>,
  logger: { info: (...a: unknown[]) => void; warn: (...a: unknown[]) => void },
) {
  logger.info(`[runtime-observation] ${event}`, fields);
}

function resolveExternalContactKey(dto: OutboundObservedDto): string | null {
  if (dto.externalContactKey?.trim()) {
    return dto.externalContactKey.trim();
  }
  if (dto.phone?.trim()) {
    const phone = derivePhoneNormalized(dto.phone.trim()) ?? dto.phone.trim().replace(/^\+/, "");
    if (/^\d{8,15}$/.test(phone)) {
      return `${phone}@s.whatsapp.net`;
    }
  }
  return null;
}

/**
 * Runtime → SaaS outbound observation. BusinessID resolved from accountKey only.
 */
export async function ingestWhatsAppOutboundObserved(
  dto: OutboundObservedDto,
  logger: { info: (...a: unknown[]) => void; warn: (...a: unknown[]) => void } = console,
): Promise<OutboundObservedOutcome> {
  const connection = await messagingRepo.resolveChannelByExternalAccountKey(
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
  const occurredAtUtc = parseOptionalUtc(dto.occurredAt) ?? new Date();
  const externalContactKey = resolveExternalContactKey(dto);
  const phoneNormalized =
    (dto.phone ? derivePhoneNormalized(dto.phone) : null)
    ?? (externalContactKey ? derivePhoneNormalized(externalContactKey) : null);

  const existing = await findOutboundObservation({
    channelConnectionId,
    providerMessageId: dto.providerMessageId,
  });
  if (existing) {
    logObservation(
      "duplicate",
      {
        businessId,
        conversationId: existing.conversationId,
        providerMessageId: dto.providerMessageId,
        origin: dto.origin,
      },
      logger,
    );
    return {
      outcome: "duplicate",
      origin: dto.origin,
      observationId: existing.outboundObservationId,
      conversationId: existing.conversationId,
    };
  }

  if (dto.origin === "DRVOWA_API") {
    const { observation, inserted } = await insertOutboundObservationIdempotent({
      businessId,
      channelConnectionId,
      conversationId: null,
      contactId: null,
      providerMessageId: dto.providerMessageId,
      origin: "DRVOWA_API",
      phoneNormalized,
      externalContactKey,
      occurredAtUtc,
    });
    if (!inserted) {
      logObservation(
        "duplicate",
        {
          businessId,
          conversationId: observation.conversationId,
          providerMessageId: dto.providerMessageId,
          origin: dto.origin,
        },
        logger,
      );
      return {
        outcome: "duplicate",
        origin: "DRVOWA_API",
        observationId: observation.outboundObservationId,
        conversationId: observation.conversationId,
      };
    }
    logObservation(
      "accepted",
      {
        businessId,
        conversationId: null,
        providerMessageId: dto.providerMessageId,
        origin: "DRVOWA_API",
      },
      logger,
    );
    return {
      outcome: "accepted",
      origin: "DRVOWA_API",
      observationId: observation.outboundObservationId,
      conversationId: null,
      paused: false,
    };
  }

  // HUMAN_MANUAL — pause conversation AI + skip pending jobs
  return withTransaction(async (trx) => {
    let contactId: string | null = null;
    let conversationId: string | null = null;

    if (externalContactKey) {
      const contact = await messagingRepo.upsertContact(
        {
          businessId,
          channelConnectionId,
          externalContactKey,
          phoneNormalized,
        },
        trx,
      );
      contactId = contact.contactId;
      const conversation = await messagingRepo.upsertOpenConversation(
        {
          businessId,
          channelConnectionId,
          contactId: contact.contactId,
        },
        trx,
      );
      conversationId = conversation.conversationId;
    }

    const { observation, inserted } = await insertOutboundObservationIdempotent(
      {
        businessId,
        channelConnectionId,
        conversationId,
        contactId,
        providerMessageId: dto.providerMessageId,
        origin: "HUMAN_MANUAL",
        phoneNormalized,
        externalContactKey,
        occurredAtUtc,
      },
      trx,
    );

    if (!inserted) {
      logObservation(
        "duplicate",
        {
          businessId,
          conversationId: observation.conversationId,
          providerMessageId: dto.providerMessageId,
          origin: "HUMAN_MANUAL",
        },
        logger,
      );
      return {
        outcome: "duplicate" as const,
        origin: "HUMAN_MANUAL" as const,
        observationId: observation.outboundObservationId,
        conversationId: observation.conversationId,
      };
    }

    if (conversationId) {
      await pauseConversationAi(
        {
          businessId,
          conversationId,
          mode: "HUMAN_PAUSED",
          pauseReason: "HUMAN_TAKEOVER",
          pausedAtUtc: occurredAtUtc,
          lastHumanOutboundProviderMessageId: dto.providerMessageId,
        },
        trx,
      );
      await skipPendingJobsForConversation(
        {
          businessId,
          conversationId,
          errorCode: "HUMAN_TAKEOVER",
        },
        trx,
      );
      logAiSafety(
        "human_takeover",
        {
          businessId,
          conversationId,
          providerMessageId: dto.providerMessageId,
          origin: "HUMAN_MANUAL",
          reason: "HUMAN_TAKEOVER",
        },
        logger,
      );
    }

    logObservation(
      "accepted",
      {
        businessId,
        conversationId,
        providerMessageId: dto.providerMessageId,
        origin: "HUMAN_MANUAL",
      },
      logger,
    );

    return {
      outcome: "accepted" as const,
      origin: "HUMAN_MANUAL" as const,
      observationId: observation.outboundObservationId,
      conversationId,
      paused: Boolean(conversationId),
    };
  });
}
