import { randomUUID } from "node:crypto";

import {
  isUniqueViolationError,
  query,
  sql,
  type TransactionClient,
} from "@/lib/db";
import { normalizeUuid } from "@/lib/ids/uuid";
import type {
  WhatsappOutboundObservation,
  WhatsappOutboundOrigin,
} from "@/types/domain";

type ObservationRow = {
  OutboundObservationID: string;
  BusinessID: string;
  ChannelConnectionID: string;
  ConversationID: string | null;
  ContactID: string | null;
  ProviderMessageID: string;
  Origin: string;
  PhoneNormalized: string | null;
  ExternalContactKey: string | null;
  OccurredAtUtc: Date | null;
  CreatedAtUtc: Date;
};

function mapObservation(row: ObservationRow): WhatsappOutboundObservation {
  return {
    outboundObservationId: normalizeUuid(row.OutboundObservationID),
    businessId: normalizeUuid(row.BusinessID),
    channelConnectionId: normalizeUuid(row.ChannelConnectionID),
    conversationId: row.ConversationID
      ? normalizeUuid(row.ConversationID)
      : null,
    contactId: row.ContactID ? normalizeUuid(row.ContactID) : null,
    providerMessageId: row.ProviderMessageID,
    origin: row.Origin as WhatsappOutboundOrigin,
    phoneNormalized: row.PhoneNormalized,
    externalContactKey: row.ExternalContactKey,
    occurredAtUtc: row.OccurredAtUtc,
    createdAtUtc: row.CreatedAtUtc,
  };
}

function db(trx?: TransactionClient) {
  return {
    query: trx ? trx.query.bind(trx) : query,
    execute: trx
      ? trx.execute.bind(trx)
      : async (text: string, inputs: Parameters<typeof query>[1] = []) => {
          const result = await query(text, inputs);
          return result.rowsAffected.reduce((s, n) => s + n, 0);
        },
  };
}

export async function findOutboundObservation(params: {
  channelConnectionId: string;
  providerMessageId: string;
}, trx?: TransactionClient): Promise<WhatsappOutboundObservation | null> {
  const result = await db(trx).query<ObservationRow>(
    `SELECT OutboundObservationID, BusinessID, ChannelConnectionID, ConversationID,
            ContactID, ProviderMessageID, Origin, PhoneNormalized, ExternalContactKey,
            OccurredAtUtc, CreatedAtUtc
     FROM TblWhatsappOutboundObservation
     WHERE ChannelConnectionID = @channelConnectionId
       AND ProviderMessageID = @providerMessageId`,
    [
      {
        name: "channelConnectionId",
        type: sql.UniqueIdentifier,
        value: params.channelConnectionId,
      },
      {
        name: "providerMessageId",
        type: sql.NVarChar(256),
        value: params.providerMessageId,
      },
    ],
  );
  const row = result.recordset[0];
  return row ? mapObservation(row) : null;
}

/**
 * Insert observation idempotently on (ChannelConnectionID, ProviderMessageID).
 * Returns inserted=false for duplicate spool delivery.
 */
export async function insertOutboundObservationIdempotent(
  params: {
    businessId: string;
    channelConnectionId: string;
    conversationId: string | null;
    contactId: string | null;
    providerMessageId: string;
    origin: WhatsappOutboundOrigin;
    phoneNormalized: string | null;
    externalContactKey: string | null;
    occurredAtUtc: Date | null;
  },
  trx?: TransactionClient,
): Promise<{ observation: WhatsappOutboundObservation; inserted: boolean }> {
  const existing = await findOutboundObservation(
    {
      channelConnectionId: params.channelConnectionId,
      providerMessageId: params.providerMessageId,
    },
    trx,
  );
  if (existing) {
    return { observation: existing, inserted: false };
  }

  const id = randomUUID();
  try {
    await db(trx).execute(
      `INSERT INTO TblWhatsappOutboundObservation (
         OutboundObservationID, BusinessID, ChannelConnectionID, ConversationID,
         ContactID, ProviderMessageID, Origin, PhoneNormalized, ExternalContactKey,
         OccurredAtUtc, CreatedAtUtc
       ) VALUES (
         @id, @businessId, @channelConnectionId, @conversationId,
         @contactId, @providerMessageId, @origin, @phoneNormalized, @externalContactKey,
         @occurredAtUtc, SYSUTCDATETIME()
       )`,
      [
        { name: "id", type: sql.UniqueIdentifier, value: id },
        {
          name: "businessId",
          type: sql.UniqueIdentifier,
          value: params.businessId,
        },
        {
          name: "channelConnectionId",
          type: sql.UniqueIdentifier,
          value: params.channelConnectionId,
        },
        {
          name: "conversationId",
          type: sql.UniqueIdentifier,
          value: params.conversationId,
        },
        {
          name: "contactId",
          type: sql.UniqueIdentifier,
          value: params.contactId,
        },
        {
          name: "providerMessageId",
          type: sql.NVarChar(256),
          value: params.providerMessageId,
        },
        { name: "origin", type: sql.NVarChar(32), value: params.origin },
        {
          name: "phoneNormalized",
          type: sql.NVarChar(32),
          value: params.phoneNormalized,
        },
        {
          name: "externalContactKey",
          type: sql.NVarChar(256),
          value: params.externalContactKey,
        },
        {
          name: "occurredAtUtc",
          type: sql.DateTime2,
          value: params.occurredAtUtc,
        },
      ],
    );
  } catch (error) {
    if (!isUniqueViolationError(error)) throw error;
    const dup = await findOutboundObservation(
      {
        channelConnectionId: params.channelConnectionId,
        providerMessageId: params.providerMessageId,
      },
      trx,
    );
    if (!dup) throw error;
    return { observation: dup, inserted: false };
  }

  return {
    observation: {
      outboundObservationId: id,
      businessId: params.businessId,
      channelConnectionId: params.channelConnectionId,
      conversationId: params.conversationId,
      contactId: params.contactId,
      providerMessageId: params.providerMessageId,
      origin: params.origin,
      phoneNormalized: params.phoneNormalized,
      externalContactKey: params.externalContactKey,
      occurredAtUtc: params.occurredAtUtc,
      createdAtUtc: new Date(),
    },
    inserted: true,
  };
}
