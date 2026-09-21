import type { BusinessRole } from "@/constants/roles";
import type { KnowledgeCategory } from "@/constants/knowledge";

export type UserStatus = "ACTIVE" | "INACTIVE" | "SUSPENDED";
export type BusinessStatus = "ACTIVE" | "INACTIVE" | "SUSPENDED";
export type MemberStatus = "ACTIVE" | "INACTIVE";
export type ChannelConnectionStatus =
  | "PENDING"
  | "ACTIVE"
  | "INACTIVE"
  | "ERROR"
  | "DISCONNECTED";
export type IntegrationStatus = "PENDING" | "ACTIVE" | "INACTIVE" | "ERROR";
export type PlanStatus = "ACTIVE" | "INACTIVE";
export type SubscriptionStatus =
  | "TRIALING"
  | "ACTIVE"
  | "PAST_DUE"
  | "CANCELED"
  | "INACTIVE"
  | "EXPIRED";

export type User = {
  userId: string;
  email: string;
  fullName: string;
  status: UserStatus;
  createdAtUtc: Date;
  updatedAtUtc: Date;
};

export type Business = {
  businessId: string;
  name: string;
  slug: string;
  category: string;
  countryCode: string;
  locale: string;
  timezone: string;
  status: BusinessStatus;
  onboardingCompletedAtUtc: Date | null;
  createdAtUtc: Date;
  updatedAtUtc: Date;
};

export type BusinessMember = {
  businessMemberId: string;
  businessId: string;
  userId: string;
  role: BusinessRole;
  status: MemberStatus;
  createdAtUtc: Date;
};

export type Session = {
  sessionId: string;
  userId: string;
  tokenHash: string;
  activeBusinessId: string | null;
  expiresAtUtc: Date;
  createdAtUtc: Date;
  revokedAtUtc: Date | null;
};

export type Location = {
  locationId: string;
  businessId: string;
  name: string;
  code: string | null;
  timezone: string | null;
  addressLine: string | null;
  city: string | null;
  phone: string | null;
  isActive: boolean;
  createdAtUtc: Date;
  updatedAtUtc: Date;
};

export type Agent = {
  agentId: string;
  businessId: string;
  name: string;
  roleTitle: string;
  language: string;
  dialect: string | null;
  tone: string | null;
  instructions: string | null;
  isActive: boolean;
  createdAtUtc: Date;
  updatedAtUtc: Date;
};

export type KnowledgeBase = {
  knowledgeBaseId: string;
  businessId: string;
  name: string;
  isActive: boolean;
  createdAtUtc: Date;
  updatedAtUtc: Date;
};

export type KnowledgeItem = {
  knowledgeItemId: string;
  knowledgeBaseId: string;
  businessId: string;
  category: KnowledgeCategory;
  title: string;
  content: string;
  isActive: boolean;
  createdAtUtc: Date;
  updatedAtUtc: Date;
};

export type ChannelConnection = {
  channelConnectionId: string;
  businessId: string;
  locationId: string | null;
  channel: string;
  provider: string;
  externalAccountKey: string | null;
  displayName: string | null;
  maskedPhone: string | null;
  status: ChannelConnectionStatus;
  isActive: boolean;
  createdAtUtc: Date;
  updatedAtUtc: Date;
};

export type ConversationStatus = "OPEN" | "CLOSED";
export type MessageDirection = "INBOUND" | "OUTBOUND";
export type MessageContentType = "TEXT" | "UNKNOWN";

export type Contact = {
  contactId: string;
  businessId: string;
  channelConnectionId: string;
  externalContactKey: string;
  displayName: string | null;
  phoneNormalized: string | null;
  createdAtUtc: Date;
  updatedAtUtc: Date;
};

export type Conversation = {
  conversationId: string;
  businessId: string;
  channelConnectionId: string;
  contactId: string;
  status: ConversationStatus;
  lastMessageAtUtc: Date | null;
  lastInboundAtUtc: Date | null;
  lastOutboundAtUtc: Date | null;
  createdAtUtc: Date;
  updatedAtUtc: Date;
};

export type Message = {
  messageId: string;
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
  createdAtUtc: Date;
};

export type ConversationAiMode = "AUTO" | "HUMAN_PAUSED" | "SAFETY_PAUSED";

export type ConversationListItem = Conversation & {
  contactExternalKey: string;
  contactDisplayName: string | null;
  contactPhoneNormalized: string | null;
  lastMessagePreview: string | null;
  lastMessageDirection: MessageDirection | null;
  aiMode: ConversationAiMode;
  aiPauseReason: string | null;
};

export type AiReplyJobStatus =
  | "PENDING"
  | "PROCESSING"
  | "SENT"
  | "SKIPPED"
  | "FAILED"
  | "COALESCED";

export type ChannelAiSetting = {
  channelAiSettingId: string;
  businessId: string;
  channelConnectionId: string;
  agentId: string;
  autoReplyEnabled: boolean;
  enabledAtUtc: Date | null;
  debounceMs: number;
  createdAtUtc: Date;
  updatedAtUtc: Date;
};

export type AiReplyJob = {
  aiReplyJobId: string;
  businessId: string;
  channelConnectionId: string;
  conversationId: string;
  contactId: string;
  triggerMessageId: string;
  status: AiReplyJobStatus;
  notBeforeUtc: Date;
  attemptCount: number;
  leaseUntilUtc: Date | null;
  leaseToken: string | null;
  leaseOwner: string | null;
  leaseVersion: number;
  outboundUnknownCount: number;
  startedAtUtc: Date | null;
  completedAtUtc: Date | null;
  lastErrorCode: string | null;
  generatedReplyText: string | null;
  generatedModel: string | null;
  generatedAtUtc: Date | null;
  outboundProviderMessageId: string | null;
  createdAtUtc: Date;
  updatedAtUtc: Date;
};

export type ConversationAiState = {
  businessId: string;
  conversationId: string;
  mode: ConversationAiMode;
  pausedAtUtc: Date | null;
  pauseReason: string | null;
  resumedAtUtc: Date | null;
  lastHumanOutboundProviderMessageId: string | null;
  createdAtUtc: Date;
  updatedAtUtc: Date;
};

export type WhatsappOutboundOrigin = "DRVOWA_API" | "HUMAN_MANUAL";

export type WhatsappOutboundObservation = {
  outboundObservationId: string;
  businessId: string;
  channelConnectionId: string;
  conversationId: string | null;
  contactId: string | null;
  providerMessageId: string;
  origin: WhatsappOutboundOrigin;
  phoneNormalized: string | null;
  externalContactKey: string | null;
  occurredAtUtc: Date | null;
  createdAtUtc: Date;
};

export type AiConversationGuard = {
  businessId: string;
  conversationId: string;
  pausedUntilUtc: Date | null;
  pauseReason: string | null;
  triggeredAtUtc: Date | null;
  createdAtUtc: Date;
  updatedAtUtc: Date;
};

export type Integration = {
  integrationId: string;
  businessId: string;
  type: string;
  status: IntegrationStatus;
  externalReference: string | null;
  configJson: string | null;
  createdAtUtc: Date;
  updatedAtUtc: Date;
};

export type UsageEvent = {
  usageEventId: string;
  businessId: string;
  eventType: string;
  quantity: number;
  occurredAtUtc: Date;
  metadataJson: string | null;
  usageKey?: string | null;
};

export type PlanBillingInterval = "MONTHLY";

export type Plan = {
  planId: string;
  code: string;
  displayName: string;
  status: PlanStatus;
  maxWhatsAppConnections?: number | null;
  maxAgents?: number | null;
  maxActiveKnowledgeItems?: number | null;
  monthlyAiReplies?: number | null;
  monthlyWhatsAppOutbound?: number | null;
  monthlyPriceAmount?: number | null;
  currencyCode?: string | null;
  billingInterval?: PlanBillingInterval | null;
  createdAtUtc: Date;
  updatedAtUtc: Date;
};

export type PlatformAdminRole = "SUPER_ADMIN" | "BILLING_ADMIN";

export type PlatformAdmin = {
  platformAdminId: string;
  userId: string;
  role: PlatformAdminRole;
  isActive: boolean;
  createdAtUtc: Date;
  updatedAtUtc: Date;
};

export type ManualPaymentStatus =
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "CANCELED";

export type ManualPaymentMethod = "INSTAPAY";

export type ManualPaymentRequest = {
  paymentRequestId: string;
  businessId: string;
  requestedPlanId: string;
  paymentMethod: ManualPaymentMethod;
  currencyCode: string;
  amount: number;
  paymentReference: string;
  payerName: string | null;
  transferReference: string | null;
  customerNote: string | null;
  status: ManualPaymentStatus;
  submittedByUserId: string;
  submittedAtUtc: Date;
  reviewedByUserId: string | null;
  reviewedAtUtc: Date | null;
  reviewNote: string | null;
  approvedSubscriptionId: string | null;
  createdAtUtc: Date;
  updatedAtUtc: Date;
};

export type Subscription = {
  subscriptionId: string;
  businessId: string;
  planId: string;
  status: SubscriptionStatus;
  periodStartUtc: Date | null;
  periodEndUtc: Date | null;
  providerName?: string | null;
  externalCustomerId?: string | null;
  externalSubscriptionId?: string | null;
  createdAtUtc: Date;
  updatedAtUtc: Date;
};

export type AuditEvent = {
  auditEventId: string;
  businessId: string | null;
  actorUserId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  occurredAtUtc: Date;
  metadataJson: string | null;
};

export type AuthSessionView = {
  sessionId: string;
  userId: string;
  email: string;
  fullName: string;
  activeBusinessId: string | null;
  expiresAtUtc: Date;
};
