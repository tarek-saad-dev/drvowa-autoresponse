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
  | "INACTIVE";

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
};

export type Plan = {
  planId: string;
  code: string;
  displayName: string;
  status: PlanStatus;
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
