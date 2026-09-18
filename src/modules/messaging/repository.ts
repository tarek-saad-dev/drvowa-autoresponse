import { randomUUID } from "node:crypto";

import {
  isUniqueViolationError,
  query,
  sql,
  type TransactionClient,
} from "@/lib/db";
import { normalizeUuid } from "@/lib/ids/uuid";
import type {
  ChannelConnection,
  Contact,
  Conversation,
  ConversationListItem,
  Message,
  MessageContentType,
  MessageDirection,
} from "@/types/domain";

type ChannelRow = {
  ChannelConnectionID: string;
  BusinessID: string;
  LocationID: string | null;
  Channel: string;
  Provider: string;
  ExternalAccountKey: string | null;
  DisplayName: string | null;
  MaskedPhone: string | null;
  Status: string;
  IsActive: boolean | number;
  CreatedAtUtc: Date;
  UpdatedAtUtc: Date;
};

type ContactRow = {
  ContactID: string;
  BusinessID: string;
  ChannelConnectionID: string;
  ExternalContactKey: string;
  DisplayName: string | null;
  PhoneNormalized: string | null;
  CreatedAtUtc: Date;
  UpdatedAtUtc: Date;
};

type ConversationRow = {
  ConversationID: string;
  BusinessID: string;
  ChannelConnectionID: string;
  ContactID: string;
  Status: string;
  LastMessageAtUtc: Date | null;
  LastInboundAtUtc: Date | null;
  LastOutboundAtUtc: Date | null;
  CreatedAtUtc: Date;
  UpdatedAtUtc: Date;
};

type MessageRow = {
  MessageID: string;
  BusinessID: string;
  ConversationID: string;
  ChannelConnectionID: string;
  ContactID: string;
  Direction: string;
  Provider: string;
  ProviderMessageID: string;
  ContentType: string;
  TextContent: string | null;
  ProviderTimestampUtc: Date | null;
  ReceivedAtUtc: Date;
  CreatedAtUtc: Date;
};

type ConversationListRow = ConversationRow & {
  ContactExternalKey: string;
  ContactDisplayName: string | null;
  ContactPhoneNormalized: string | null;
  LastMessagePreview: string | null;
  LastMessageDirection: string | null;
};

function mapChannel(row: ChannelRow): ChannelConnection {
  return {
    channelConnectionId: normalizeUuid(row.ChannelConnectionID),
    businessId: normalizeUuid(row.BusinessID),
    locationId: row.LocationID ? normalizeUuid(row.LocationID) : null,
    channel: row.Channel,
    provider: row.Provider,
    externalAccountKey: row.ExternalAccountKey,
    displayName: row.DisplayName,
    maskedPhone: row.MaskedPhone,
    status: row.Status as ChannelConnection["status"],
    isActive: Boolean(row.IsActive),
    createdAtUtc: row.CreatedAtUtc,
    updatedAtUtc: row.UpdatedAtUtc,
  };
}

function mapContact(row: ContactRow): Contact {
  return {
    contactId: normalizeUuid(row.ContactID),
    businessId: normalizeUuid(row.BusinessID),
    channelConnectionId: normalizeUuid(row.ChannelConnectionID),
    externalContactKey: row.ExternalContactKey,
    displayName: row.DisplayName,
    phoneNormalized: row.PhoneNormalized,
    createdAtUtc: row.CreatedAtUtc,
    updatedAtUtc: row.UpdatedAtUtc,
  };
}

function mapConversation(row: ConversationRow): Conversation {
  return {
    conversationId: normalizeUuid(row.ConversationID),
    businessId: normalizeUuid(row.BusinessID),
    channelConnectionId: normalizeUuid(row.ChannelConnectionID),
    contactId: normalizeUuid(row.ContactID),
    status: row.Status as Conversation["status"],
    lastMessageAtUtc: row.LastMessageAtUtc,
    lastInboundAtUtc: row.LastInboundAtUtc,
    lastOutboundAtUtc: row.LastOutboundAtUtc,
    createdAtUtc: row.CreatedAtUtc,
    updatedAtUtc: row.UpdatedAtUtc,
  };
}

function mapMessage(row: MessageRow): Message {
  return {
    messageId: normalizeUuid(row.MessageID),
    businessId: normalizeUuid(row.BusinessID),
    conversationId: normalizeUuid(row.ConversationID),
    channelConnectionId: normalizeUuid(row.ChannelConnectionID),
    contactId: normalizeUuid(row.ContactID),
    direction: row.Direction as MessageDirection,
    provider: row.Provider,
    providerMessageId: row.ProviderMessageID,
    contentType: row.ContentType as MessageContentType,
    textContent: row.TextContent,
    providerTimestampUtc: row.ProviderTimestampUtc,
    receivedAtUtc: row.ReceivedAtUtc,
    createdAtUtc: row.CreatedAtUtc,
  };
}

function db(trx?: TransactionClient) {
  return {
    query: trx ? trx.query.bind(trx) : query,
  };
}

/**
 * Resolve WHATSAPP/BAILEYS ChannelConnection by trusted ExternalAccountKey.
 * Never accepts BusinessID from the runtime.
 */
export async function resolveChannelByExternalAccountKey(
  accountKey: string,
): Promise<ChannelConnection | null> {
  const result = await query<ChannelRow>(
    `SELECT ChannelConnectionID, BusinessID, LocationID, Channel, Provider,
            ExternalAccountKey, DisplayName, MaskedPhone, Status, IsActive,
            CreatedAtUtc, UpdatedAtUtc
     FROM TblChannelConnection
     WHERE Channel = N'WHATSAPP'
       AND Provider = N'BAILEYS'
       AND ExternalAccountKey = @accountKey`,
    [{ name: "accountKey", type: sql.NVarChar(256), value: accountKey }],
  );
  const row = result.recordset[0];
  return row ? mapChannel(row) : null;
}

export async function findMessageByProviderId(
  params: {
    channelConnectionId: string;
    providerMessageId: string;
  },
  trx?: TransactionClient,
): Promise<Message | null> {
  const result = await db(trx).query<MessageRow>(
    `SELECT MessageID, BusinessID, ConversationID, ChannelConnectionID, ContactID,
            Direction, Provider, ProviderMessageID, ContentType, TextContent,
            ProviderTimestampUtc, ReceivedAtUtc, CreatedAtUtc
     FROM TblMessage
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
  return row ? mapMessage(row) : null;
}

export async function upsertContact(
  params: {
    businessId: string;
    channelConnectionId: string;
    externalContactKey: string;
    phoneNormalized: string | null;
  },
  trx: TransactionClient,
): Promise<Contact> {
  const existing = await trx.query<ContactRow>(
    `SELECT ContactID, BusinessID, ChannelConnectionID, ExternalContactKey,
            DisplayName, PhoneNormalized, CreatedAtUtc, UpdatedAtUtc
     FROM TblContact
     WHERE BusinessID = @businessId
       AND ChannelConnectionID = @channelConnectionId
       AND ExternalContactKey = @externalContactKey`,
    [
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
        name: "externalContactKey",
        type: sql.NVarChar(256),
        value: params.externalContactKey,
      },
    ],
  );

  if (existing.recordset[0]) {
    const row = existing.recordset[0];
    if (
      params.phoneNormalized
      && !row.PhoneNormalized
    ) {
      await trx.execute(
        `UPDATE TblContact
         SET PhoneNormalized = @phoneNormalized,
             UpdatedAtUtc = SYSUTCDATETIME()
         WHERE BusinessID = @businessId AND ContactID = @contactId`,
        [
          {
            name: "phoneNormalized",
            type: sql.NVarChar(32),
            value: params.phoneNormalized,
          },
          {
            name: "businessId",
            type: sql.UniqueIdentifier,
            value: params.businessId,
          },
          {
            name: "contactId",
            type: sql.UniqueIdentifier,
            value: row.ContactID,
          },
        ],
      );
      return {
        ...mapContact(row),
        phoneNormalized: params.phoneNormalized,
        updatedAtUtc: new Date(),
      };
    }
    return mapContact(row);
  }

  const contactId = randomUUID();
  try {
    await trx.execute(
      `INSERT INTO TblContact (
         ContactID, BusinessID, ChannelConnectionID, ExternalContactKey,
         DisplayName, PhoneNormalized, CreatedAtUtc, UpdatedAtUtc
       ) VALUES (
         @contactId, @businessId, @channelConnectionId, @externalContactKey,
         NULL, @phoneNormalized, SYSUTCDATETIME(), SYSUTCDATETIME()
       )`,
      [
        {
          name: "contactId",
          type: sql.UniqueIdentifier,
          value: contactId,
        },
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
          name: "externalContactKey",
          type: sql.NVarChar(256),
          value: params.externalContactKey,
        },
        {
          name: "phoneNormalized",
          type: sql.NVarChar(32),
          value: params.phoneNormalized,
        },
      ],
    );
  } catch (error) {
    if (!isUniqueViolationError(error)) throw error;
    const raced = await trx.query<ContactRow>(
      `SELECT ContactID, BusinessID, ChannelConnectionID, ExternalContactKey,
              DisplayName, PhoneNormalized, CreatedAtUtc, UpdatedAtUtc
       FROM TblContact
       WHERE BusinessID = @businessId
         AND ChannelConnectionID = @channelConnectionId
         AND ExternalContactKey = @externalContactKey`,
      [
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
          name: "externalContactKey",
          type: sql.NVarChar(256),
          value: params.externalContactKey,
        },
      ],
    );
    const row = raced.recordset[0];
    if (!row) throw error;
    return mapContact(row);
  }

  const inserted = await trx.query<ContactRow>(
    `SELECT ContactID, BusinessID, ChannelConnectionID, ExternalContactKey,
            DisplayName, PhoneNormalized, CreatedAtUtc, UpdatedAtUtc
     FROM TblContact
     WHERE BusinessID = @businessId AND ContactID = @contactId`,
    [
      {
        name: "businessId",
        type: sql.UniqueIdentifier,
        value: params.businessId,
      },
      {
        name: "contactId",
        type: sql.UniqueIdentifier,
        value: contactId,
      },
    ],
  );
  return mapContact(inserted.recordset[0]!);
}

export async function upsertOpenConversation(
  params: {
    businessId: string;
    channelConnectionId: string;
    contactId: string;
  },
  trx: TransactionClient,
): Promise<Conversation> {
  const existing = await trx.query<ConversationRow>(
    `SELECT ConversationID, BusinessID, ChannelConnectionID, ContactID, Status,
            LastMessageAtUtc, LastInboundAtUtc, LastOutboundAtUtc,
            CreatedAtUtc, UpdatedAtUtc
     FROM TblConversation
     WHERE BusinessID = @businessId
       AND ChannelConnectionID = @channelConnectionId
       AND ContactID = @contactId`,
    [
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
        name: "contactId",
        type: sql.UniqueIdentifier,
        value: params.contactId,
      },
    ],
  );

  if (existing.recordset[0]) {
    const row = existing.recordset[0];
    if (row.Status !== "OPEN") {
      await trx.execute(
        `UPDATE TblConversation
         SET Status = N'OPEN', UpdatedAtUtc = SYSUTCDATETIME()
         WHERE BusinessID = @businessId AND ConversationID = @conversationId`,
        [
          {
            name: "businessId",
            type: sql.UniqueIdentifier,
            value: params.businessId,
          },
          {
            name: "conversationId",
            type: sql.UniqueIdentifier,
            value: row.ConversationID,
          },
        ],
      );
      return { ...mapConversation(row), status: "OPEN", updatedAtUtc: new Date() };
    }
    return mapConversation(row);
  }

  const conversationId = randomUUID();
  try {
    await trx.execute(
      `INSERT INTO TblConversation (
         ConversationID, BusinessID, ChannelConnectionID, ContactID, Status,
         LastMessageAtUtc, LastInboundAtUtc, LastOutboundAtUtc,
         CreatedAtUtc, UpdatedAtUtc
       ) VALUES (
         @conversationId, @businessId, @channelConnectionId, @contactId, N'OPEN',
         NULL, NULL, NULL, SYSUTCDATETIME(), SYSUTCDATETIME()
       )`,
      [
        {
          name: "conversationId",
          type: sql.UniqueIdentifier,
          value: conversationId,
        },
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
          name: "contactId",
          type: sql.UniqueIdentifier,
          value: params.contactId,
        },
      ],
    );
  } catch (error) {
    if (!isUniqueViolationError(error)) throw error;
    const raced = await trx.query<ConversationRow>(
      `SELECT ConversationID, BusinessID, ChannelConnectionID, ContactID, Status,
              LastMessageAtUtc, LastInboundAtUtc, LastOutboundAtUtc,
              CreatedAtUtc, UpdatedAtUtc
       FROM TblConversation
       WHERE BusinessID = @businessId
         AND ChannelConnectionID = @channelConnectionId
         AND ContactID = @contactId`,
      [
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
          name: "contactId",
          type: sql.UniqueIdentifier,
          value: params.contactId,
        },
      ],
    );
    const row = raced.recordset[0];
    if (!row) throw error;
    return mapConversation(row);
  }

  const inserted = await trx.query<ConversationRow>(
    `SELECT ConversationID, BusinessID, ChannelConnectionID, ContactID, Status,
            LastMessageAtUtc, LastInboundAtUtc, LastOutboundAtUtc,
            CreatedAtUtc, UpdatedAtUtc
     FROM TblConversation
     WHERE BusinessID = @businessId AND ConversationID = @conversationId`,
    [
      {
        name: "businessId",
        type: sql.UniqueIdentifier,
        value: params.businessId,
      },
      {
        name: "conversationId",
        type: sql.UniqueIdentifier,
        value: conversationId,
      },
    ],
  );
  return mapConversation(inserted.recordset[0]!);
}

export type InsertMessageParams = {
  businessId: string;
  conversationId: string;
  channelConnectionId: string;
  contactId: string;
  direction: MessageDirection;
  provider: string;
  providerMessageId: string;
  contentType: MessageContentType;
  textContent: string | null;
  providerTimestampUtc: Date | null;
  receivedAtUtc: Date;
};

export async function insertMessageIdempotent(
  params: InsertMessageParams,
  trx: TransactionClient,
): Promise<{ message: Message; inserted: boolean }> {
  const existing = await findMessageByProviderId(
    {
      channelConnectionId: params.channelConnectionId,
      providerMessageId: params.providerMessageId,
    },
    trx,
  );
  if (existing) {
    return { message: existing, inserted: false };
  }

  const messageId = randomUUID();
  try {
    await trx.execute(
      `INSERT INTO TblMessage (
         MessageID, BusinessID, ConversationID, ChannelConnectionID, ContactID,
         Direction, Provider, ProviderMessageID, ContentType, TextContent,
         ProviderTimestampUtc, ReceivedAtUtc, CreatedAtUtc
       ) VALUES (
         @messageId, @businessId, @conversationId, @channelConnectionId, @contactId,
         @direction, @provider, @providerMessageId, @contentType, @textContent,
         @providerTimestampUtc, @receivedAtUtc, SYSUTCDATETIME()
       )`,
      [
        {
          name: "messageId",
          type: sql.UniqueIdentifier,
          value: messageId,
        },
        {
          name: "businessId",
          type: sql.UniqueIdentifier,
          value: params.businessId,
        },
        {
          name: "conversationId",
          type: sql.UniqueIdentifier,
          value: params.conversationId,
        },
        {
          name: "channelConnectionId",
          type: sql.UniqueIdentifier,
          value: params.channelConnectionId,
        },
        {
          name: "contactId",
          type: sql.UniqueIdentifier,
          value: params.contactId,
        },
        {
          name: "direction",
          type: sql.NVarChar(16),
          value: params.direction,
        },
        {
          name: "provider",
          type: sql.NVarChar(32),
          value: params.provider,
        },
        {
          name: "providerMessageId",
          type: sql.NVarChar(256),
          value: params.providerMessageId,
        },
        {
          name: "contentType",
          type: sql.NVarChar(32),
          value: params.contentType,
        },
        {
          name: "textContent",
          type: sql.NVarChar(sql.MAX),
          value: params.textContent,
        },
        {
          name: "providerTimestampUtc",
          type: sql.DateTime2,
          value: params.providerTimestampUtc,
        },
        {
          name: "receivedAtUtc",
          type: sql.DateTime2,
          value: params.receivedAtUtc,
        },
      ],
    );
  } catch (error) {
    if (!isUniqueViolationError(error)) throw error;
    const raced = await findMessageByProviderId(
      {
        channelConnectionId: params.channelConnectionId,
        providerMessageId: params.providerMessageId,
      },
      trx,
    );
    if (!raced) throw error;
    return { message: raced, inserted: false };
  }

  return {
    message: {
      messageId,
      businessId: params.businessId,
      conversationId: params.conversationId,
      channelConnectionId: params.channelConnectionId,
      contactId: params.contactId,
      direction: params.direction,
      provider: params.provider,
      providerMessageId: params.providerMessageId,
      contentType: params.contentType,
      textContent: params.textContent,
      providerTimestampUtc: params.providerTimestampUtc,
      receivedAtUtc: params.receivedAtUtc,
      createdAtUtc: new Date(),
    },
    inserted: true,
  };
}

export async function touchConversationInbound(
  params: {
    businessId: string;
    conversationId: string;
    at: Date;
  },
  trx: TransactionClient,
): Promise<void> {
  await trx.execute(
    `UPDATE TblConversation
     SET LastMessageAtUtc = @at,
         LastInboundAtUtc = @at,
         Status = N'OPEN',
         UpdatedAtUtc = SYSUTCDATETIME()
     WHERE BusinessID = @businessId AND ConversationID = @conversationId`,
    [
      { name: "at", type: sql.DateTime2, value: params.at },
      {
        name: "businessId",
        type: sql.UniqueIdentifier,
        value: params.businessId,
      },
      {
        name: "conversationId",
        type: sql.UniqueIdentifier,
        value: params.conversationId,
      },
    ],
  );
}

export async function insertUsageEventInTrx(
  params: {
    businessId: string;
    eventType: string;
    quantity: number;
    occurredAtUtc?: Date;
    metadata?: Record<string, unknown> | null;
  },
  trx: TransactionClient,
): Promise<void> {
  const usageEventId = randomUUID();
  const occurredAtUtc = params.occurredAtUtc ?? new Date();
  const metadataJson = params.metadata
    ? JSON.stringify(params.metadata)
    : null;

  await trx.execute(
    `INSERT INTO TblUsageEvent (
       UsageEventID, BusinessID, EventType, Quantity, OccurredAtUtc, MetadataJson
     ) VALUES (
       @usageEventId, @businessId, @eventType, @quantity, @occurredAtUtc, @metadataJson
     )`,
    [
      {
        name: "usageEventId",
        type: sql.UniqueIdentifier,
        value: usageEventId,
      },
      {
        name: "businessId",
        type: sql.UniqueIdentifier,
        value: params.businessId,
      },
      { name: "eventType", type: sql.NVarChar(64), value: params.eventType },
      { name: "quantity", type: sql.Int, value: params.quantity },
      { name: "occurredAtUtc", type: sql.DateTime2, value: occurredAtUtc },
      {
        name: "metadataJson",
        type: sql.NVarChar(sql.MAX),
        value: metadataJson,
      },
    ],
  );
}

export async function listConversationsForBusiness(params: {
  businessId: string;
  limit?: number;
}): Promise<ConversationListItem[]> {
  const limit = Math.min(Math.max(params.limit ?? 50, 1), 100);
  const result = await query<ConversationListRow>(
    `SELECT TOP (@limit)
        c.ConversationID, c.BusinessID, c.ChannelConnectionID, c.ContactID, c.Status,
        c.LastMessageAtUtc, c.LastInboundAtUtc, c.LastOutboundAtUtc,
        c.CreatedAtUtc, c.UpdatedAtUtc,
        ct.ExternalContactKey AS ContactExternalKey,
        ct.DisplayName AS ContactDisplayName,
        ct.PhoneNormalized AS ContactPhoneNormalized,
        (
          SELECT TOP 1 m.TextContent
          FROM TblMessage m
          WHERE m.BusinessID = c.BusinessID AND m.ConversationID = c.ConversationID
          ORDER BY ISNULL(m.ProviderTimestampUtc, m.CreatedAtUtc) DESC, m.CreatedAtUtc DESC
        ) AS LastMessagePreview,
        (
          SELECT TOP 1 m.Direction
          FROM TblMessage m
          WHERE m.BusinessID = c.BusinessID AND m.ConversationID = c.ConversationID
          ORDER BY ISNULL(m.ProviderTimestampUtc, m.CreatedAtUtc) DESC, m.CreatedAtUtc DESC
        ) AS LastMessageDirection
     FROM TblConversation c
     INNER JOIN TblContact ct
       ON ct.ContactID = c.ContactID AND ct.BusinessID = c.BusinessID
     WHERE c.BusinessID = @businessId
     ORDER BY ISNULL(c.LastMessageAtUtc, c.CreatedAtUtc) DESC`,
    [
      {
        name: "businessId",
        type: sql.UniqueIdentifier,
        value: params.businessId,
      },
      { name: "limit", type: sql.Int, value: limit },
    ],
  );

  return result.recordset.map((row) => ({
    ...mapConversation(row),
    contactExternalKey: row.ContactExternalKey,
    contactDisplayName: row.ContactDisplayName,
    contactPhoneNormalized: row.ContactPhoneNormalized,
    lastMessagePreview: row.LastMessagePreview,
    lastMessageDirection: row.LastMessageDirection
      ? (row.LastMessageDirection as MessageDirection)
      : null,
  }));
}

export async function getConversationForBusiness(params: {
  businessId: string;
  conversationId: string;
}): Promise<Conversation | null> {
  const result = await query<ConversationRow>(
    `SELECT ConversationID, BusinessID, ChannelConnectionID, ContactID, Status,
            LastMessageAtUtc, LastInboundAtUtc, LastOutboundAtUtc,
            CreatedAtUtc, UpdatedAtUtc
     FROM TblConversation
     WHERE BusinessID = @businessId AND ConversationID = @conversationId`,
    [
      {
        name: "businessId",
        type: sql.UniqueIdentifier,
        value: params.businessId,
      },
      {
        name: "conversationId",
        type: sql.UniqueIdentifier,
        value: params.conversationId,
      },
    ],
  );
  const row = result.recordset[0];
  return row ? mapConversation(row) : null;
}

export type MessageListCursor = {
  at: Date;
  createdAtUtc: Date;
  messageId: string;
};

export async function listMessagesForConversation(params: {
  businessId: string;
  conversationId: string;
  limit?: number;
  /** Keyset cursor: load the page of messages strictly older than this message. */
  before?: MessageListCursor | null;
}): Promise<Message[]> {
  const limit = Math.min(Math.max(params.limit ?? 100, 1), 200);
  const before = params.before ?? null;

  const result = await query<MessageRow>(
    before
      ? `SELECT * FROM (
           SELECT TOP (@limit)
              MessageID, BusinessID, ConversationID, ChannelConnectionID, ContactID,
              Direction, Provider, ProviderMessageID, ContentType, TextContent,
              ProviderTimestampUtc, ReceivedAtUtc, CreatedAtUtc
           FROM TblMessage
           WHERE BusinessID = @businessId
             AND ConversationID = @conversationId
             AND (
               ISNULL(ProviderTimestampUtc, CreatedAtUtc) < @beforeAt
               OR (
                 ISNULL(ProviderTimestampUtc, CreatedAtUtc) = @beforeAt
                 AND (
                   CreatedAtUtc < @beforeCreatedAt
                   OR (
                     CreatedAtUtc = @beforeCreatedAt
                     AND MessageID < @beforeMessageId
                   )
                 )
               )
             )
           ORDER BY ISNULL(ProviderTimestampUtc, CreatedAtUtc) DESC,
                    CreatedAtUtc DESC,
                    MessageID DESC
         ) AS page
         ORDER BY ISNULL(ProviderTimestampUtc, CreatedAtUtc) ASC,
                  CreatedAtUtc ASC,
                  MessageID ASC`
      : `SELECT * FROM (
           SELECT TOP (@limit)
              MessageID, BusinessID, ConversationID, ChannelConnectionID, ContactID,
              Direction, Provider, ProviderMessageID, ContentType, TextContent,
              ProviderTimestampUtc, ReceivedAtUtc, CreatedAtUtc
           FROM TblMessage
           WHERE BusinessID = @businessId
             AND ConversationID = @conversationId
           ORDER BY ISNULL(ProviderTimestampUtc, CreatedAtUtc) DESC,
                    CreatedAtUtc DESC,
                    MessageID DESC
         ) AS page
         ORDER BY ISNULL(ProviderTimestampUtc, CreatedAtUtc) ASC,
                  CreatedAtUtc ASC,
                  MessageID ASC`,
    [
      {
        name: "businessId",
        type: sql.UniqueIdentifier,
        value: params.businessId,
      },
      {
        name: "conversationId",
        type: sql.UniqueIdentifier,
        value: params.conversationId,
      },
      { name: "limit", type: sql.Int, value: limit },
      ...(before
        ? [
            { name: "beforeAt", type: sql.DateTime2, value: before.at },
            {
              name: "beforeCreatedAt",
              type: sql.DateTime2,
              value: before.createdAtUtc,
            },
            {
              name: "beforeMessageId",
              type: sql.UniqueIdentifier,
              value: before.messageId,
            },
          ]
        : []),
    ],
  );

  return result.recordset.map(mapMessage);
}

export async function countUsageEvents(params: {
  businessId: string;
  eventType: string;
}): Promise<number> {
  const result = await query<{ Cnt: number }>(
    `SELECT COUNT(1) AS Cnt
     FROM TblUsageEvent
     WHERE BusinessID = @businessId AND EventType = @eventType`,
    [
      {
        name: "businessId",
        type: sql.UniqueIdentifier,
        value: params.businessId,
      },
      { name: "eventType", type: sql.NVarChar(64), value: params.eventType },
    ],
  );
  return Number(result.recordset[0]?.Cnt ?? 0);
}

export async function countMessagesForBusiness(params: {
  businessId: string;
}): Promise<number> {
  const result = await query<{ Cnt: number }>(
    `SELECT COUNT(1) AS Cnt FROM TblMessage WHERE BusinessID = @businessId`,
    [
      {
        name: "businessId",
        type: sql.UniqueIdentifier,
        value: params.businessId,
      },
    ],
  );
  return Number(result.recordset[0]?.Cnt ?? 0);
}
