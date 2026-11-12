import { query, sql } from "@/lib/db";
import { normalizeUuid } from "@/lib/ids/uuid";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@/lib/tenancy/errors";
import { getMembership } from "@/modules/businesses/service";
import type { BusinessRole } from "@/constants/roles";

import { phonesLikelySame, normalizeCrmPhone } from "./phone";
import * as repo from "./repository";
import type {
  CrmCustomer,
  CrmCustomerListFilters,
  CrmCustomerListResult,
  CrmCustomerProfile,
  CrmCustomerSource,
  CrmCustomerStatus,
  CrmFollowUp,
  CrmFollowUpPriority,
  CrmFollowUpStatus,
  CrmNote,
  CrmTag,
} from "./types";

export async function requireCrmMembership(params: {
  businessId: string;
  userId: string;
}): Promise<{ role: BusinessRole; status: string }> {
  const membership = await getMembership(params);
  if (!membership || membership.status !== "ACTIVE") {
    throw new ForbiddenError("عضوية النشاط مطلوبة");
  }
  return { role: membership.role, status: membership.status };
}

export async function requireCrmWriteAccess(params: {
  businessId: string;
  userId: string;
}): Promise<{ role: BusinessRole }> {
  const membership = await requireCrmMembership(params);
  if (membership.role !== "OWNER" && membership.role !== "ADMIN") {
    throw new ForbiddenError("صلاحيات الكتابة متاحة للمالك أو المسؤول فقط");
  }
  return membership;
}

function assertMemberCanAccessCustomer(params: {
  role: BusinessRole;
  userId: string;
  customer: CrmCustomer;
}): void {
  if (params.role === "OWNER" || params.role === "ADMIN") return;
  if (params.customer.assignedUserId !== params.userId) {
    throw new ForbiddenError("يمكنك عرض العملاء المسندين إليك فقط");
  }
}

export async function createCustomer(params: {
  businessId: string;
  userId: string;
  fullName: string;
  primaryPhone?: string | null;
  email?: string | null;
  source?: CrmCustomerSource;
  status?: CrmCustomerStatus;
  assignedUserId?: string | null;
}): Promise<CrmCustomer> {
  await requireCrmWriteAccess(params);
  const fullName = params.fullName.trim();
  if (fullName.length < 2) throw new ValidationError("اسم العميل مطلوب");
  return repo.createCustomer({
    businessId: params.businessId,
    fullName,
    primaryPhoneNormalized: params.primaryPhone ?? null,
    email: params.email ?? null,
    source: params.source ?? "MANUAL",
    status: params.status ?? "ACTIVE",
    assignedUserId: params.assignedUserId ?? null,
    actorUserId: params.userId,
  });
}

export async function updateCustomer(params: {
  businessId: string;
  userId: string;
  customerId: string;
  fullName?: string;
  primaryPhone?: string | null;
  email?: string | null;
  status?: CrmCustomerStatus;
  assignedUserId?: string | null;
}): Promise<CrmCustomer> {
  await requireCrmWriteAccess(params);
  return repo.updateCustomer({
    businessId: params.businessId,
    customerId: params.customerId,
    fullName: params.fullName,
    primaryPhoneNormalized: params.primaryPhone,
    email: params.email,
    status: params.status,
    assignedUserId: params.assignedUserId,
    actorUserId: params.userId,
  });
}

export async function listCustomers(params: {
  businessId: string;
  userId: string;
  filters: CrmCustomerListFilters;
}): Promise<CrmCustomerListResult> {
  const membership = await requireCrmMembership(params);
  const filters = { ...params.filters };
  if (membership.role === "MEMBER") {
    filters.assignedUserId = params.userId;
  }
  return repo.listCustomers({ businessId: params.businessId, filters });
}

export async function getCustomerProfile(params: {
  businessId: string;
  userId: string;
  customerId: string;
}): Promise<CrmCustomerProfile> {
  const membership = await requireCrmMembership(params);
  const customer = await repo.getCustomerById({
    businessId: params.businessId,
    customerId: params.customerId,
  });
  if (!customer) throw new NotFoundError("العميل غير موجود");
  assertMemberCanAccessCustomer({
    role: membership.role,
    userId: params.userId,
    customer,
  });

  const [phones, notes, followUps, activities, conversations, erp, erpInvoices] =
    await Promise.all([
      repo.listCustomerPhones(params),
      repo.listNotes(params),
      repo.listFollowUps({
        businessId: params.businessId,
        customerId: params.customerId,
        pageSize: 50,
      }),
      repo.listActivities({ ...params, limit: 80 }),
      repo.listCustomerConversations(params),
      repo.getErpAggregatesForCustomer(params),
      repo.listErpInvoicesForCustomer(params),
    ]);

  const hasErp = erp.totalVisits > 0 || Boolean(customer.externalErpClientId);

  return {
    customer,
    phones,
    notes,
    followUps: followUps.items,
    activities,
    conversations,
    erp: { ...erp, connected: hasErp },
    erpInvoices,
  };
}

export async function ensureCustomerFromWhatsAppContact(params: {
  businessId: string;
  contactId: string;
  displayName?: string | null;
  phoneNormalized?: string | null;
}): Promise<CrmCustomer> {
  const linkedId = await repo.getCustomerIdByContactId({
    businessId: params.businessId,
    contactId: params.contactId,
  });
  if (linkedId) {
    const existing = await repo.getCustomerById({
      businessId: params.businessId,
      customerId: linkedId,
    });
    if (existing) return existing;
  }

  const phone = normalizeCrmPhone(params.phoneNormalized);
  if (phone) {
    const byPhone = await repo.getCustomerByPhone({
      businessId: params.businessId,
      phoneNormalized: phone,
    });
    if (byPhone) {
      await repo.linkContactToCustomer({
        businessId: params.businessId,
        customerId: byPhone.customerId,
        contactId: params.contactId,
        linkSource: "PHONE_MATCH",
      });
      return byPhone;
    }
  }

  const fullName =
    params.displayName?.trim()
    || (phone ? `عميل واتساب ${phone.slice(-4)}` : "عميل واتساب");

  const created = await repo.createCustomer({
    businessId: params.businessId,
    fullName,
    primaryPhoneNormalized: phone,
    source: "WHATSAPP",
    status: "ACTIVE",
  });
  await repo.linkContactToCustomer({
    businessId: params.businessId,
    customerId: created.customerId,
    contactId: params.contactId,
    linkSource: "PHONE_MATCH",
  });
  return created;
}

export async function linkContactToCustomer(params: {
  businessId: string;
  userId: string;
  customerId: string;
  contactId: string;
}): Promise<void> {
  await requireCrmWriteAccess(params);
  const customer = await repo.getCustomerById({
    businessId: params.businessId,
    customerId: params.customerId,
  });
  if (!customer) throw new NotFoundError("العميل غير موجود");

  const contact = await query<{
    ContactID: string;
    PhoneNormalized: string | null;
  }>(
    `SELECT ContactID, PhoneNormalized FROM dbo.TblContact
     WHERE BusinessID = @businessId AND ContactID = @contactId`,
    [
      { name: "businessId", type: sql.UniqueIdentifier, value: params.businessId },
      { name: "contactId", type: sql.UniqueIdentifier, value: params.contactId },
    ],
  );
  if (!contact.recordset[0]) throw new NotFoundError("جهة الاتصال غير موجودة");

  const existingLink = await repo.getCustomerIdByContactId({
    businessId: params.businessId,
    contactId: params.contactId,
  });
  if (existingLink && existingLink !== params.customerId) {
    throw new ConflictError("جهة الاتصال مرتبطة بعميل آخر");
  }

  await repo.linkContactToCustomer({
    businessId: params.businessId,
    customerId: params.customerId,
    contactId: params.contactId,
    linkSource: "MANUAL",
  });
}

/**
 * Merge only when phone suffixes match OR both share / provide explicit ERP client id.
 * Never merge on name alone.
 */
export async function mergeCustomers(params: {
  businessId: string;
  userId: string;
  survivorCustomerId: string;
  mergedCustomerId: string;
  explicitErpClientId?: string | null;
}): Promise<CrmCustomer> {
  await requireCrmWriteAccess(params);
  const survivor = await repo.getCustomerById({
    businessId: params.businessId,
    customerId: params.survivorCustomerId,
  });
  const merged = await repo.getCustomerById({
    businessId: params.businessId,
    customerId: params.mergedCustomerId,
  });
  if (!survivor || !merged) throw new NotFoundError("أحد العملاء غير موجود");

  const samePhone = phonesLikelySame(
    survivor.primaryPhoneNormalized,
    merged.primaryPhoneNormalized,
  );
  const erpId =
    params.explicitErpClientId
    ?? survivor.externalErpClientId
    ?? merged.externalErpClientId;
  const sameErp =
    Boolean(erpId)
    && (
      survivor.externalErpClientId === erpId
      || merged.externalErpClientId === erpId
    )
    && (
      !survivor.externalErpClientId
      || !merged.externalErpClientId
      || survivor.externalErpClientId === merged.externalErpClientId
    );

  if (!samePhone && !sameErp) {
    throw new ValidationError(
      "لا يمكن الدمج إلا عند تطابق رقم الهاتف أو وجود معرف ERP صريح مشترك",
    );
  }

  return repo.mergeCustomers({
    businessId: params.businessId,
    survivorCustomerId: params.survivorCustomerId,
    mergedCustomerId: params.mergedCustomerId,
    actorUserId: params.userId,
  });
}

export async function addCustomerNote(params: {
  businessId: string;
  userId: string;
  customerId: string;
  body: string;
}): Promise<CrmNote> {
  await requireCrmWriteAccess(params);
  const customer = await repo.getCustomerById(params);
  if (!customer) throw new NotFoundError("العميل غير موجود");
  return repo.createNote({
    businessId: params.businessId,
    customerId: params.customerId,
    body: params.body,
    createdByUserId: params.userId,
  });
}

export async function updateCustomerNote(params: {
  businessId: string;
  userId: string;
  customerId: string;
  noteId: string;
  body: string;
}): Promise<CrmNote> {
  await requireCrmWriteAccess(params);
  return repo.updateNote({
    businessId: params.businessId,
    customerId: params.customerId,
    noteId: params.noteId,
    body: params.body,
    updatedByUserId: params.userId,
  });
}

export async function listCustomerNotes(params: {
  businessId: string;
  userId: string;
  customerId: string;
}): Promise<CrmNote[]> {
  const membership = await requireCrmMembership(params);
  const customer = await repo.getCustomerById(params);
  if (!customer) throw new NotFoundError("العميل غير موجود");
  assertMemberCanAccessCustomer({
    role: membership.role,
    userId: params.userId,
    customer,
  });
  return repo.listNotes(params);
}

export async function attachCustomerTag(params: {
  businessId: string;
  userId: string;
  customerId: string;
  tagId?: string;
  tagName?: string;
  color?: string | null;
}): Promise<CrmTag[]> {
  await requireCrmWriteAccess(params);
  const customer = await repo.getCustomerById(params);
  if (!customer) throw new NotFoundError("العميل غير موجود");
  let tagId = params.tagId;
  if (!tagId) {
    if (!params.tagName?.trim()) throw new ValidationError("اسم الوسم مطلوب");
    const tag = await repo.ensureTag({
      businessId: params.businessId,
      name: params.tagName,
      color: params.color,
    });
    tagId = tag.tagId;
  }
  await repo.attachTag({
    businessId: params.businessId,
    customerId: params.customerId,
    tagId,
    actorUserId: params.userId,
  });
  const updated = await repo.getCustomerById(params);
  return updated?.tags ?? [];
}

export async function detachCustomerTag(params: {
  businessId: string;
  userId: string;
  customerId: string;
  tagId: string;
}): Promise<CrmTag[]> {
  await requireCrmWriteAccess(params);
  await repo.detachTag({
    businessId: params.businessId,
    customerId: params.customerId,
    tagId: params.tagId,
    actorUserId: params.userId,
  });
  const updated = await repo.getCustomerById(params);
  return updated?.tags ?? [];
}

export async function listCustomerTags(params: {
  businessId: string;
  userId: string;
  customerId: string;
}): Promise<CrmTag[]> {
  const membership = await requireCrmMembership(params);
  const customer = await repo.getCustomerById(params);
  if (!customer) throw new NotFoundError("العميل غير موجود");
  assertMemberCanAccessCustomer({
    role: membership.role,
    userId: params.userId,
    customer,
  });
  return customer.tags;
}

export async function createFollowUp(params: {
  businessId: string;
  userId: string;
  customerId: string;
  title: string;
  description?: string | null;
  dueAtUtc?: string | null;
  priority?: CrmFollowUpPriority;
  assignedUserId?: string | null;
  conversationId?: string | null;
}): Promise<CrmFollowUp> {
  await requireCrmWriteAccess(params);
  const customer = await repo.getCustomerById({
    businessId: params.businessId,
    customerId: params.customerId,
  });
  if (!customer) throw new NotFoundError("العميل غير موجود");
  return repo.createFollowUp({
    businessId: params.businessId,
    customerId: params.customerId,
    title: params.title,
    description: params.description,
    dueAtUtc: params.dueAtUtc,
    priority: params.priority,
    assignedUserId: params.assignedUserId ?? params.userId,
    conversationId: params.conversationId,
    createdByUserId: params.userId,
  });
}

export async function listFollowUps(params: {
  businessId: string;
  userId: string;
  customerId?: string | null;
  status?: CrmFollowUpStatus | null;
  page?: number;
  pageSize?: number;
}): Promise<{ items: CrmFollowUp[]; total: number; page: number; pageSize: number }> {
  const membership = await requireCrmMembership(params);
  return repo.listFollowUps({
    businessId: params.businessId,
    customerId: params.customerId,
    assignedUserId: membership.role === "MEMBER" ? params.userId : null,
    status: params.status,
    page: params.page,
    pageSize: params.pageSize,
  });
}

export async function updateFollowUp(params: {
  businessId: string;
  userId: string;
  followUpId: string;
  title?: string;
  description?: string | null;
  dueAtUtc?: string | null;
  priority?: CrmFollowUpPriority;
  status?: CrmFollowUpStatus;
  assignedUserId?: string | null;
}): Promise<CrmFollowUp> {
  await requireCrmWriteAccess(params);
  return repo.updateFollowUp({
    ...params,
    actorUserId: params.userId,
  });
}

export async function backfillCustomersFromWhatsAppContacts(params: {
  businessId: string;
  limit?: number;
}): Promise<{ processed: number; created: number; linked: number }> {
  const limit = Math.min(200, Math.max(1, params.limit ?? 50));
  const contacts = await repo.listUnlinkedWhatsAppContacts({
    businessId: params.businessId,
    limit,
  });
  let created = 0;
  let linked = 0;
  for (const contact of contacts) {
    const phone = contact.phoneNormalized
      ? await repo.getCustomerByPhone({
          businessId: params.businessId,
          phoneNormalized: contact.phoneNormalized,
        })
      : null;
    const existed = Boolean(phone);
    await ensureCustomerFromWhatsAppContact({
      businessId: params.businessId,
      contactId: contact.contactId,
      displayName: contact.displayName,
      phoneNormalized: contact.phoneNormalized,
    });
    if (existed) linked += 1;
    else created += 1;
  }
  return { processed: contacts.length, created, linked };
}

export async function getInboxCrmPanel(params: {
  businessId: string;
  userId: string;
  conversationId: string;
}) {
  const membership = await requireCrmMembership(params);
  const panel = await repo.getInboxPanelByConversationId({
    businessId: params.businessId,
    conversationId: normalizeUuid(params.conversationId),
  });
  if (!panel) throw new NotFoundError("المحادثة غير موجودة");

  // Align with CRM customer access: MEMBERs only see assigned customers' CRM data.
  if (panel.customer) {
    try {
      assertMemberCanAccessCustomer({
        role: membership.role,
        userId: params.userId,
        customer: panel.customer,
      });
    } catch {
      return {
        conversationId: panel.conversationId,
        contactId: panel.contactId,
        customer: {
          ...panel.customer,
          // Strip restricted profile fields for unauthorized members.
          email: null,
          tags: [],
        },
        openFollowUps: [],
        latestNote: null,
        erp: null,
        restricted: true as const,
      };
    }
  }

  return { ...panel, restricted: false as const };
}
