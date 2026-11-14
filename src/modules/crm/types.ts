export type CrmCustomerStatus =
  | "ACTIVE"
  | "INACTIVE"
  | "LEAD"
  | "BLOCKED"
  | "MERGED";

export type CrmCustomerSource =
  | "MANUAL"
  | "WHATSAPP"
  | "ERP"
  | "IMPORT"
  | "MERGE";

export type CrmFollowUpPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";
export type CrmFollowUpStatus = "OPEN" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";

export type CrmCustomer = {
  customerId: string;
  businessId: string;
  fullName: string;
  primaryPhoneNormalized: string | null;
  email: string | null;
  source: CrmCustomerSource;
  status: CrmCustomerStatus;
  assignedUserId: string | null;
  assignedUserName: string | null;
  lastInteractionAtUtc: string | null;
  externalErpClientId: string | null;
  createdAtUtc: string;
  updatedAtUtc: string;
  tags: CrmTag[];
};

export type CrmTag = {
  tagId: string;
  name: string;
  color: string | null;
};

export type CrmNote = {
  noteId: string;
  customerId: string;
  body: string;
  createdByUserId: string;
  createdByName: string | null;
  updatedByUserId: string | null;
  createdAtUtc: string;
  updatedAtUtc: string;
};

export type CrmFollowUp = {
  followUpId: string;
  customerId: string;
  customerName: string | null;
  assignedUserId: string | null;
  assignedUserName: string | null;
  conversationId: string | null;
  title: string;
  description: string | null;
  dueAtUtc: string | null;
  priority: CrmFollowUpPriority;
  status: CrmFollowUpStatus;
  completedAtUtc: string | null;
  createdByUserId: string;
  createdAtUtc: string;
  updatedAtUtc: string;
};

export type CrmActivity = {
  activityId: string;
  customerId: string;
  activityType: string;
  title: string;
  body: string | null;
  actorUserId: string | null;
  actorName: string | null;
  relatedEntityType: string | null;
  relatedEntityId: string | null;
  occurredAtUtc: string;
};

export type CrmConversationLink = {
  conversationId: string;
  contactId: string;
  status: string;
  lastMessageAtUtc: string | null;
  lastMessagePreview: string | null;
  contactDisplayName: string | null;
  contactPhoneNormalized: string | null;
};

export type CrmErpSummary = {
  connected: boolean;
  totalVisits: number;
  lastVisitAt: string | null;
  totalSpend: number;
  averageInvoice: number;
  favoriteService: string | null;
  favoriteEmployee: string | null;
  mostVisitedBranch: string | null;
  lifetimeValue: number;
};

export type CrmErpInvoice = {
  invoiceMirrorId: string;
  externalInvId: string;
  invDate: string | null;
  branchName: string | null;
  grandTotal: number;
  lines: Array<{
    proName: string | null;
    empName: string | null;
    qty: number;
    lineTotal: number;
    proType: string | null;
  }>;
};

export type CrmCustomerProfile = {
  customer: CrmCustomer;
  phones: Array<{ phoneNormalized: string; label: string | null; isPrimary: boolean }>;
  notes: CrmNote[];
  followUps: CrmFollowUp[];
  activities: CrmActivity[];
  conversations: CrmConversationLink[];
  erp: CrmErpSummary;
  erpInvoices: CrmErpInvoice[];
};

export type CrmCustomerListFilters = {
  q?: string | null;
  status?: CrmCustomerStatus | null;
  tagId?: string | null;
  source?: CrmCustomerSource | null;
  assignedUserId?: string | null;
  lastInteractionFrom?: string | null;
  lastInteractionTo?: string | null;
  sort?: "name" | "lastInteraction" | "created" | "spend";
  sortDir?: "asc" | "desc";
  page?: number;
  pageSize?: number;
};

export type CrmCustomerListResult = {
  items: CrmCustomer[];
  total: number;
  page: number;
  pageSize: number;
};

export type CrmSegment = {
  segmentId: string;
  name: string;
  description: string | null;
  filterJson: string;
  explanationAr: string | null;
  createdAtUtc: string;
  updatedAtUtc: string;
};

export type CrmAudiencePreview = {
  name: string;
  filter: AudienceFilterAst;
  explanationAr: string;
  totalMatched: number;
  /** Full-audience counts when countsScope=full_audience; otherwise preview-page scoped. */
  withPhone: number;
  eligibleMarketing: number;
  withoutPermission: number;
  duplicatesRemoved: number;
  countsScope: "preview_page" | "full_audience";
  previewLimit?: number;
  truncated?: boolean;
  audienceCap?: number;
  channelConnectionId: string;
  channelDisplayName?: string | null;
  customers: Array<{
    customerId: string;
    fullName: string;
    primaryPhoneNormalized: string | null;
    marketingEligible: boolean;
    exclusionReason: string | null;
    totalSpend: number | null;
    lastVisitAt: string | null;
  }>;
};

/** Controlled audience filter AST — never execute raw LLM SQL. */
export type AudienceFilterAst = {
  version: 1;
  name?: string;
  all?: AudiencePredicate[];
  any?: AudiencePredicate[];
  exclude?: AudiencePredicate[];
  limit?: number;
  orderBy?: "spend_desc" | "visits_desc" | "last_visit_desc" | "name_asc";
};

export type AudiencePredicate =
  | { type: "status"; op: "eq" | "in"; values: CrmCustomerStatus[] }
  | { type: "source"; op: "eq" | "in"; values: CrmCustomerSource[] }
  | { type: "tag"; op: "has_any" | "has_all"; tagNames: string[] }
  | { type: "assigned_user"; op: "eq" | "is_null"; userId?: string }
  | { type: "has_phone"; value: boolean }
  | { type: "last_interaction"; op: "before_days_ago" | "within_days" | "between"; days?: number; from?: string; to?: string }
  | { type: "erp_last_visit"; op: "before_days_ago" | "within_days" | "between"; days?: number; from?: string; to?: string }
  | { type: "erp_invoice_date"; op: "between"; from: string; to: string }
  | { type: "erp_spend"; op: "gte" | "lte" | "between"; amount?: number; min?: number; max?: number; windowDays?: number }
  | { type: "erp_visits"; op: "gte" | "lte" | "eq"; count: number; windowDays?: number }
  | { type: "erp_service"; op: "name_contains" | "pro_id_in" | "category_contains"; values: string[]; minTimes?: number; windowDays?: number; from?: string; to?: string }
  | { type: "erp_product"; op: "name_contains" | "pro_id_in"; values: string[]; windowDays?: number; from?: string; to?: string }
  | { type: "erp_branch"; op: "id_in" | "name_contains"; values: string[] }
  | { type: "excluded_from_campaign_days"; days: number }
  | { type: "marketing_permission"; op: "eligible" | "any" };
