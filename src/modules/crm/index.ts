export type {
  AudienceFilterAst,
  AudiencePredicate,
  CrmActivity,
  CrmAudiencePreview,
  CrmConversationLink,
  CrmCustomer,
  CrmCustomerListFilters,
  CrmCustomerListResult,
  CrmCustomerProfile,
  CrmCustomerSource,
  CrmCustomerStatus,
  CrmErpInvoice,
  CrmErpSummary,
  CrmFollowUp,
  CrmFollowUpPriority,
  CrmFollowUpStatus,
  CrmNote,
  CrmSegment,
  CrmTag,
} from "./types";

export {
  normalizeCrmPhone,
  phoneMatchSuffix,
  phonesLikelySame,
} from "./phone";

export {
  requireCampaignWhatsAppChannel,
  listCampaignWhatsAppChannels,
} from "./channel";
export type { CrmWhatsAppChannel } from "./channel";

export {
  parseAudienceFilterAst,
  mergeAudienceFilters,
  explainAudienceFilterAr,
  audienceFilterAstSchema,
  AudienceComplexityError,
} from "./audience-ast";

export {
  compileAudienceFilter,
  AUDIENCE_MAX_ROWS,
  AUDIENCE_QUERY_TIMEOUT_MS,
} from "./audience-compiler";

export {
  isValidErpSaleInvoice,
  erpInvoiceExternalKey,
} from "./erp-sync";

export {
  createCustomer,
  updateCustomer,
  listCustomers,
  getCustomerProfile,
  ensureCustomerFromWhatsAppContact,
  linkContactToCustomer,
  mergeCustomers,
  addCustomerNote,
  updateCustomerNote,
  listCustomerNotes,
  attachCustomerTag,
  detachCustomerTag,
  listCustomerTags,
  createFollowUp,
  listFollowUps,
  updateFollowUp,
  backfillCustomersFromWhatsAppContacts,
  getInboxCrmPanel,
  requireCrmMembership,
  requireCrmWriteAccess,
} from "./service";

export { syncErpForBusiness, getErpSyncStatus } from "./erp-sync";

export {
  previewAudience,
  materializeAudience,
  freezeAudienceSnapshot,
  revalidateSnapshotEligibility,
  saveSegment,
  listSegments,
  AUDIENCE_PREVIEW_PAGE_SIZE,
  AUDIENCE_SNAPSHOT_MAX_ROWS,
} from "./audience-service";

export { runCampaignAiTurn } from "./campaign-ai";
export type { CampaignAiTurnInput, CampaignAiTurnResult } from "./campaign-ai";
