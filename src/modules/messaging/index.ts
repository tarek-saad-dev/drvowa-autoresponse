export {
  inboundWhatsAppDtoSchema,
  normalizeInboundContent,
  derivePhoneNormalized,
  parseOptionalUtc,
  type InboundWhatsAppDto,
  type NormalizedContent,
} from "./content";
export {
  canonicalizeWhatsAppContactIdentity,
  type WhatsAppContactIdentity,
} from "./whatsapp-identity";
export {
  ingestWhatsAppInbound,
  listInboxConversations,
  listInboxMessages,
  resolveChannelByExternalAccountKey,
  type IngestOutcome,
} from "./service";
