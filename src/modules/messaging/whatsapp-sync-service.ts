import { z } from "zod";
import { query, sql, withTransaction, type TransactionClient } from "@/lib/db";
import { NotFoundError } from "@/lib/tenancy/errors";
import { parseOptionalUtc } from "@/modules/messaging/content";
import { canonicalizeWhatsAppContactIdentity } from "@/modules/messaging/whatsapp-identity";
import * as messages from "@/modules/messaging/repository";

const contactKey = z.string().trim().min(5).max(256);
const contactSync = z.object({
  kind: z.literal("chat"),
  contactKey,
  displayName: z.string().trim().max(200).nullable().optional(),
  lastMessageAt: z.string().datetime({ offset: true }).nullable().optional(),
  archived: z.boolean().optional(),
  pinned: z.boolean().optional(),
}).strict();

const messageSync = z.object({
  kind: z.literal("message"),
  contactKey,
  providerMessageId: z.string().trim().min(1).max(256),
  direction: z.enum(["INBOUND", "OUTBOUND"]),
  historical: z.boolean(),
  occurredAt: z.string().datetime({ offset: true }),
  contentType: z.enum(["TEXT", "UNKNOWN", "IMAGE", "AUDIO", "VIDEO", "DOCUMENT", "STICKER"]),
  text: z.string().max(8000).nullable().optional(),
  mimeType: z.string().trim().max(128).nullable().optional(),
  fileName: z.string().trim().max(256).nullable().optional(),
  fileSize: z.number().nonnegative().int().max(1_000_000_000).nullable().optional(),
  quotedProviderMessageId: z.string().trim().max(256).nullable().optional(),
}).strict();

export const whatsappSyncSchema = z.object({
  accountKey: z.string().trim().min(1).max(64),
  events: z.array(z.discriminatedUnion("kind", [contactSync, messageSync])).min(1).max(25),
}).strict();
export type WhatsappSyncInput = z.infer<typeof whatsappSyncSchema>;

export async function ingestWhatsAppSync(input: WhatsappSyncInput): Promise<{
  chats: number; messages: number; duplicates: number;
}> {
  // Resolve tenant from a verified runtime accountKey; no BusinessID from callers.
  const channel = await messages.resolveChannelByExternalAccountKey(input.accountKey);
  if (!channel) throw new NotFoundError("Unknown WhatsApp account");
  if (!channel.isActive || channel.status === "INACTIVE" || channel.status === "DISCONNECTED") {
    throw new Error("WHATSAPP_CONNECTION_INACTIVE");
  }

  const result = { chats: 0, messages: 0, duplicates: 0 };
  for (const event of input.events) {
    // Each event is independently idempotent; crash midway is safe to retry.
    const inserted = await withTransaction(async trx => {
      const key = canonicalizeWhatsAppContactIdentity({ externalContactKey: event.contactKey });
      const contact = await messages.upsertContact({
        businessId: channel.businessId,
        channelConnectionId: channel.channelConnectionId,
        externalContactKey: key.canonicalExternalContactKey,
        phoneNormalized: key.phoneNormalized,
      }, trx);
      const conversation = await messages.upsertOpenConversation({
        businessId: channel.businessId,
        channelConnectionId: channel.channelConnectionId,
        contactId: contact.contactId,
      }, trx);
      const base = [
        { name: "businessId", type: sql.UniqueIdentifier, value: channel.businessId },
        { name: "conversationId", type: sql.UniqueIdentifier, value: conversation.conversationId },
      ];

      if (event.kind === "chat") {
        if (event.displayName) {
          await trx.execute(
            `UPDATE dbo.TblContact SET DisplayName=@name, UpdatedAtUtc=SYSUTCDATETIME()
             WHERE BusinessID=@businessId AND ContactID=@contactId
               AND (DisplayName IS NULL OR DisplayName<>@name)`,
            [
              { name: "businessId", type: sql.UniqueIdentifier, value: channel.businessId },
              { name: "contactId", type: sql.UniqueIdentifier, value: contact.contactId },
              { name: "name", type: sql.NVarChar(200), value: event.displayName },
            ],
          );
        }
        await updateConversationFromSync(trx, base, {
          time: event.lastMessageAt ? new Date(event.lastMessageAt) : null,
          archived: event.archived,
          pinned: event.pinned,
          direction: null,
          historical: true,
        });
        return "chat";
      }

      const at = parseOptionalUtc(event.occurredAt)!;
      const insertedMessage = await messages.insertMessageIdempotent({
        businessId: channel.businessId,
        conversationId: conversation.conversationId,
        channelConnectionId: channel.channelConnectionId,
        contactId: contact.contactId,
        direction: event.direction,
        provider: "baileys",
        providerMessageId: event.providerMessageId,
        contentType: event.contentType,
        textContent: event.text ?? null,
        origin: event.direction === "INBOUND" ? "CUSTOMER" : "UNKNOWN",
        providerTimestampUtc: at,
        receivedAtUtc: at,
      }, trx);

      await trx.execute(
        `UPDATE dbo.TblMessage SET
           IsHistorical = CASE WHEN @historical=1 AND IsHistorical=1 THEN 1
                               WHEN @historical=0 THEN 0 ELSE IsHistorical END,
           MediaMimeType = COALESCE(MediaMimeType,@mimeType),
           MediaFileName = COALESCE(MediaFileName,@fileName),
           MediaSizeBytes = COALESCE(MediaSizeBytes,@fileSize),
           QuotedProviderMessageID = COALESCE(QuotedProviderMessageID,@quoted)
         WHERE BusinessID=@businessId AND MessageID=@messageId`,
        [
          { name: "businessId", type: sql.UniqueIdentifier, value: channel.businessId },
          { name: "messageId", type: sql.UniqueIdentifier, value: insertedMessage.message.messageId },
          { name: "historical", type: sql.Bit, value: event.historical },
          { name: "mimeType", type: sql.NVarChar(128), value: event.mimeType ?? null },
          { name: "fileName", type: sql.NVarChar(256), value: event.fileName ?? null },
          { name: "fileSize", type: sql.BigInt, value: event.fileSize ?? null },
          { name: "quoted", type: sql.NVarChar(256), value: event.quotedProviderMessageId ?? null },
        ],
      );

      // History never moves LastInboundAtUtc or triggers an AI reply.
      // A live outgoing mirror can update LastOutboundAtUtc, while imported
      // historic messages only change the visible timeline if newer.
      await updateConversationFromSync(trx, base, {
        time: at, archived: undefined, pinned: undefined,
        direction: event.direction,
        historical: event.historical,
      });
      return insertedMessage.inserted ? "inserted" : "duplicate";
    });
    if (inserted === "chat") result.chats++;
    else if (inserted === "inserted") result.messages++;
    else result.duplicates++;
  }
  return result;
}

async function updateConversationFromSync(
  trx: TransactionClient,
  base: Array<{ name: string; type: typeof sql.UniqueIdentifier; value: string }>,
  data: {
    time: Date | null; archived?: boolean; pinned?: boolean;
    direction: "INBOUND" | "OUTBOUND" | null; historical: boolean;
  },
) {
  await trx.execute(
    `UPDATE dbo.TblConversation SET
       LastMessageAtUtc = CASE WHEN @at IS NOT NULL
         AND (LastMessageAtUtc IS NULL OR LastMessageAtUtc<@at) THEN @at
         ELSE LastMessageAtUtc END,
       LastInboundAtUtc = CASE WHEN @historical=0 AND @direction=N'INBOUND'
         AND @at IS NOT NULL AND (LastInboundAtUtc IS NULL OR LastInboundAtUtc<@at)
         THEN @at ELSE LastInboundAtUtc END,
       LastOutboundAtUtc = CASE WHEN @historical=0 AND @direction=N'OUTBOUND'
         AND @at IS NOT NULL AND (LastOutboundAtUtc IS NULL OR LastOutboundAtUtc<@at)
         THEN @at ELSE LastOutboundAtUtc END,
       IsArchived = COALESCE(@archived,IsArchived),
       IsPinned = COALESCE(@pinned,IsPinned),
       UpdatedAtUtc = SYSUTCDATETIME()
     WHERE BusinessID=@businessId AND ConversationID=@conversationId`,
    [
      ...base,
      { name: "at", type: sql.DateTime2, value: data.time },
      { name: "direction", type: sql.NVarChar(16), value: data.direction },
      { name: "historical", type: sql.Bit, value: data.historical },
      { name: "archived", type: sql.Bit, value: data.archived ?? null },
      { name: "pinned", type: sql.Bit, value: data.pinned ?? null },
    ],
  );
}
