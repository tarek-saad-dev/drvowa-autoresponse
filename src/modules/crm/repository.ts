import { randomUUID } from "node:crypto";

import {
  isUniqueViolationError,
  query,
  sql,
  withTransaction,
  type QueryInput,
  type TransactionClient,
} from "@/lib/db";
import { normalizeUuid, normalizeNullableUuid } from "@/lib/ids/uuid";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/tenancy/errors";

import { normalizeCrmPhone, phoneMatchSuffix } from "./phone";
import type {
  CrmActivity,
  CrmAudiencePreview,
  CrmConversationLink,
  CrmCustomer,
  CrmCustomerListFilters,
  CrmCustomerListResult,
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

function toIso(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function toIsoRequired(value: Date | string): string {
  return toIso(value) ?? new Date(0).toISOString();
}

function toDateOnly(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    return value.slice(0, 10);
  }
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

type CustomerRow = {
  CustomerID: string;
  BusinessID: string;
  FullName: string;
  PrimaryPhoneNormalized: string | null;
  Email: string | null;
  Source: string;
  Status: string;
  AssignedUserID: string | null;
  AssignedUserName: string | null;
  LastInteractionAtUtc: Date | null;
  ExternalErpClientId: string | null;
  CreatedAtUtc: Date;
  UpdatedAtUtc: Date;
};

type TagRow = {
  TagID: string;
  Name: string;
  Color: string | null;
};

function mapCustomer(row: CustomerRow, tags: CrmTag[] = []): CrmCustomer {
  return {
    customerId: normalizeUuid(row.CustomerID),
    businessId: normalizeUuid(row.BusinessID),
    fullName: row.FullName,
    primaryPhoneNormalized: row.PrimaryPhoneNormalized,
    email: row.Email,
    source: row.Source as CrmCustomerSource,
    status: row.Status as CrmCustomerStatus,
    assignedUserId: normalizeNullableUuid(row.AssignedUserID),
    assignedUserName: row.AssignedUserName,
    lastInteractionAtUtc: toIso(row.LastInteractionAtUtc),
    externalErpClientId: row.ExternalErpClientId,
    createdAtUtc: toIsoRequired(row.CreatedAtUtc),
    updatedAtUtc: toIsoRequired(row.UpdatedAtUtc),
    tags,
  };
}

function mapTag(row: TagRow): CrmTag {
  return {
    tagId: normalizeUuid(row.TagID),
    name: row.Name,
    color: row.Color,
  };
}

const CUSTOMER_SELECT = `
  c.CustomerID, c.BusinessID, c.FullName, c.PrimaryPhoneNormalized, c.Email,
  c.Source, c.Status, c.AssignedUserID, u.FullName AS AssignedUserName,
  c.LastInteractionAtUtc, c.ExternalErpClientId, c.CreatedAtUtc, c.UpdatedAtUtc
`;

async function loadTagsForCustomers(params: {
  businessId: string;
  customerIds: string[];
}): Promise<Map<string, CrmTag[]>> {
  const map = new Map<string, CrmTag[]>();
  if (!params.customerIds.length) return map;
  const inputs: QueryInput[] = [
    { name: "businessId", type: sql.UniqueIdentifier, value: params.businessId },
  ];
  const placeholders: string[] = [];
  params.customerIds.forEach((id, i) => {
    const name = `cid${i}`;
    placeholders.push(`@${name}`);
    inputs.push({ name, type: sql.UniqueIdentifier, value: id });
  });
  const result = await query<{ CustomerID: string } & TagRow>(
    `SELECT ct.CustomerID, t.TagID, t.Name, t.Color
     FROM dbo.TblCrmCustomerTag ct
     INNER JOIN dbo.TblCrmTag t ON t.TagID = ct.TagID AND t.BusinessID = ct.BusinessID
     WHERE ct.BusinessID = @businessId AND ct.CustomerID IN (${placeholders.join(", ")})
     ORDER BY t.Name`,
    inputs,
  );
  for (const row of result.recordset) {
    const key = normalizeUuid(row.CustomerID);
    const list = map.get(key) ?? [];
    list.push(mapTag(row));
    map.set(key, list);
  }
  return map;
}

export async function getCustomerById(params: {
  businessId: string;
  customerId: string;
}): Promise<CrmCustomer | null> {
  const result = await query<CustomerRow>(
    `SELECT ${CUSTOMER_SELECT}
     FROM dbo.TblCrmCustomer c
     LEFT JOIN dbo.TblUser u ON u.UserID = c.AssignedUserID
     WHERE c.BusinessID = @businessId AND c.CustomerID = @customerId
       AND c.Status <> N'MERGED'`,
    [
      { name: "businessId", type: sql.UniqueIdentifier, value: params.businessId },
      { name: "customerId", type: sql.UniqueIdentifier, value: params.customerId },
    ],
  );
  const row = result.recordset[0];
  if (!row) return null;
  const tags = await loadTagsForCustomers({
    businessId: params.businessId,
    customerIds: [normalizeUuid(row.CustomerID)],
  });
  return mapCustomer(row, tags.get(normalizeUuid(row.CustomerID)) ?? []);
}

export async function getCustomerByPhone(params: {
  businessId: string;
  phoneNormalized: string;
}): Promise<CrmCustomer | null> {
  const phone = normalizeCrmPhone(params.phoneNormalized) ?? params.phoneNormalized;
  const suffix = phoneMatchSuffix(phone);
  const result = await query<CustomerRow>(
    `SELECT TOP 1 ${CUSTOMER_SELECT}
     FROM dbo.TblCrmCustomer c
     LEFT JOIN dbo.TblUser u ON u.UserID = c.AssignedUserID
     WHERE c.BusinessID = @businessId
       AND c.Status <> N'MERGED'
       AND (
         c.PrimaryPhoneNormalized = @phone
         OR EXISTS (
           SELECT 1 FROM dbo.TblCrmCustomerPhone p
           WHERE p.BusinessID = c.BusinessID AND p.CustomerID = c.CustomerID
             AND p.PhoneNormalized = @phone
         )
         OR (
           @suffix IS NOT NULL
           AND (
             RIGHT(c.PrimaryPhoneNormalized, 10) = @suffix
             OR EXISTS (
               SELECT 1 FROM dbo.TblCrmCustomerPhone p
               WHERE p.BusinessID = c.BusinessID AND p.CustomerID = c.CustomerID
                 AND RIGHT(p.PhoneNormalized, 10) = @suffix
             )
           )
         )
       )
     ORDER BY CASE WHEN c.PrimaryPhoneNormalized = @phone THEN 0 ELSE 1 END, c.CreatedAtUtc`,
    [
      { name: "businessId", type: sql.UniqueIdentifier, value: params.businessId },
      { name: "phone", type: sql.NVarChar(32), value: phone },
      { name: "suffix", type: sql.NVarChar(16), value: suffix },
    ],
  );
  const row = result.recordset[0];
  if (!row) return null;
  const tags = await loadTagsForCustomers({
    businessId: params.businessId,
    customerIds: [normalizeUuid(row.CustomerID)],
  });
  return mapCustomer(row, tags.get(normalizeUuid(row.CustomerID)) ?? []);
}

export async function getCustomerByErpClientId(params: {
  businessId: string;
  externalErpClientId: string;
}): Promise<CrmCustomer | null> {
  const result = await query<CustomerRow>(
    `SELECT ${CUSTOMER_SELECT}
     FROM dbo.TblCrmCustomer c
     LEFT JOIN dbo.TblUser u ON u.UserID = c.AssignedUserID
     WHERE c.BusinessID = @businessId
       AND c.ExternalErpClientId = @erpId
       AND c.Status <> N'MERGED'`,
    [
      { name: "businessId", type: sql.UniqueIdentifier, value: params.businessId },
      { name: "erpId", type: sql.NVarChar(64), value: params.externalErpClientId },
    ],
  );
  const row = result.recordset[0];
  if (!row) return null;
  return mapCustomer(row);
}

export async function findDuplicateCandidates(params: {
  businessId: string;
  phoneNormalized: string;
}): Promise<CrmCustomer[]> {
  const phone = normalizeCrmPhone(params.phoneNormalized);
  if (!phone) return [];
  const suffix = phoneMatchSuffix(phone);
  if (!suffix) return [];
  const result = await query<CustomerRow>(
    `SELECT ${CUSTOMER_SELECT}
     FROM dbo.TblCrmCustomer c
     LEFT JOIN dbo.TblUser u ON u.UserID = c.AssignedUserID
     WHERE c.BusinessID = @businessId
       AND c.Status <> N'MERGED'
       AND (
         c.PrimaryPhoneNormalized = @phone
         OR RIGHT(c.PrimaryPhoneNormalized, 10) = @suffix
         OR EXISTS (
           SELECT 1 FROM dbo.TblCrmCustomerPhone p
           WHERE p.BusinessID = c.BusinessID AND p.CustomerID = c.CustomerID
             AND (p.PhoneNormalized = @phone OR RIGHT(p.PhoneNormalized, 10) = @suffix)
         )
       )
     ORDER BY c.CreatedAtUtc`,
    [
      { name: "businessId", type: sql.UniqueIdentifier, value: params.businessId },
      { name: "phone", type: sql.NVarChar(32), value: phone },
      { name: "suffix", type: sql.NVarChar(16), value: suffix },
    ],
  );
  const ids = result.recordset.map((r) => normalizeUuid(r.CustomerID));
  const tags = await loadTagsForCustomers({ businessId: params.businessId, customerIds: ids });
  return result.recordset.map((row) =>
    mapCustomer(row, tags.get(normalizeUuid(row.CustomerID)) ?? []),
  );
}

export async function listCustomers(params: {
  businessId: string;
  filters: CrmCustomerListFilters;
}): Promise<CrmCustomerListResult> {
  const page = Math.max(1, params.filters.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, params.filters.pageSize ?? 25));
  const offset = (page - 1) * pageSize;
  const inputs: QueryInput[] = [
    { name: "businessId", type: sql.UniqueIdentifier, value: params.businessId },
    { name: "offset", type: sql.Int, value: offset },
    { name: "pageSize", type: sql.Int, value: pageSize },
  ];
  const where = [
    "c.BusinessID = @businessId",
    "c.Status <> N'MERGED'",
    "c.MergedIntoCustomerID IS NULL",
  ];

  if (params.filters.q?.trim()) {
    const q = params.filters.q.trim();
    const phoneQ = normalizeCrmPhone(q);
    inputs.push({ name: "q", type: sql.NVarChar(200), value: `%${q}%` });
    inputs.push({ name: "phoneQ", type: sql.NVarChar(32), value: phoneQ });
    where.push(`(
      c.FullName LIKE @q
      OR c.Email LIKE @q
      OR c.PrimaryPhoneNormalized LIKE @q
      OR (@phoneQ IS NOT NULL AND (
        c.PrimaryPhoneNormalized = @phoneQ
        OR RIGHT(c.PrimaryPhoneNormalized, 10) = RIGHT(@phoneQ, 10)
      ))
    )`);
  }
  if (params.filters.status) {
    inputs.push({ name: "status", type: sql.NVarChar(32), value: params.filters.status });
    where.push("c.Status = @status");
  }
  if (params.filters.source) {
    inputs.push({ name: "source", type: sql.NVarChar(64), value: params.filters.source });
    where.push("c.Source = @source");
  }
  if (params.filters.assignedUserId) {
    inputs.push({
      name: "assignedUserId",
      type: sql.UniqueIdentifier,
      value: params.filters.assignedUserId,
    });
    where.push("c.AssignedUserID = @assignedUserId");
  }
  if (params.filters.tagId) {
    inputs.push({ name: "tagId", type: sql.UniqueIdentifier, value: params.filters.tagId });
    where.push(`EXISTS (
      SELECT 1 FROM dbo.TblCrmCustomerTag ct
      WHERE ct.BusinessID = c.BusinessID AND ct.CustomerID = c.CustomerID AND ct.TagID = @tagId
    )`);
  }
  if (params.filters.lastInteractionFrom) {
    inputs.push({
      name: "liFrom",
      type: sql.DateTime2,
      value: new Date(params.filters.lastInteractionFrom),
    });
    where.push("c.LastInteractionAtUtc >= @liFrom");
  }
  if (params.filters.lastInteractionTo) {
    inputs.push({
      name: "liTo",
      type: sql.DateTime2,
      value: new Date(params.filters.lastInteractionTo),
    });
    where.push("c.LastInteractionAtUtc <= @liTo");
  }

  const sortDir = params.filters.sortDir === "asc" ? "ASC" : "DESC";
  let orderBy = `c.LastInteractionAtUtc ${sortDir}, c.CustomerID ASC`;
  if (params.filters.sort === "name") orderBy = `c.FullName ${sortDir}, c.CustomerID ASC`;
  else if (params.filters.sort === "created") orderBy = `c.CreatedAtUtc ${sortDir}, c.CustomerID ASC`;
  else if (params.filters.sort === "spend") {
    orderBy = `(
      SELECT ISNULL(SUM(inv.GrandTotal), 0)
      FROM dbo.TblErpInvoiceMirror inv
      WHERE inv.BusinessID = c.BusinessID AND inv.CustomerID = c.CustomerID
        AND inv.IsValidSale = 1 AND inv.IsDeleted = 0
    ) ${sortDir}, c.CustomerID ASC`;
  }

  const whereSql = where.join("\n       AND ");
  const countResult = await query<{ Total: number }>(
    `SELECT COUNT(1) AS Total FROM dbo.TblCrmCustomer c WHERE ${whereSql}`,
    inputs.filter((i) => i.name !== "offset" && i.name !== "pageSize"),
  );
  const total = Number(countResult.recordset[0]?.Total ?? 0);

  const result = await query<CustomerRow>(
    `SELECT ${CUSTOMER_SELECT}
     FROM dbo.TblCrmCustomer c
     LEFT JOIN dbo.TblUser u ON u.UserID = c.AssignedUserID
     WHERE ${whereSql}
     ORDER BY ${orderBy}
     OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY`,
    inputs,
  );
  const ids = result.recordset.map((r) => normalizeUuid(r.CustomerID));
  const tags = await loadTagsForCustomers({ businessId: params.businessId, customerIds: ids });
  return {
    items: result.recordset.map((row) =>
      mapCustomer(row, tags.get(normalizeUuid(row.CustomerID)) ?? []),
    ),
    total,
    page,
    pageSize,
  };
}

export async function createCustomer(params: {
  businessId: string;
  fullName: string;
  primaryPhoneNormalized?: string | null;
  email?: string | null;
  source?: CrmCustomerSource;
  status?: CrmCustomerStatus;
  assignedUserId?: string | null;
  externalErpClientId?: string | null;
  actorUserId?: string | null;
}): Promise<CrmCustomer> {
  const customerId = randomUUID();
  const phone = params.primaryPhoneNormalized
    ? normalizeCrmPhone(params.primaryPhoneNormalized)
    : null;
  if (params.primaryPhoneNormalized && !phone) {
    throw new ValidationError("رقم الهاتف غير صالح");
  }
  try {
    await withTransaction(async (trx) => {
      await trx.query(
        `INSERT INTO dbo.TblCrmCustomer (
           CustomerID, BusinessID, FullName, PrimaryPhoneNormalized, Email,
           Source, Status, AssignedUserID, ExternalErpClientId
         ) VALUES (
           @customerId, @businessId, @fullName, @phone, @email,
           @source, @status, @assignedUserId, @erpId
         )`,
        [
          { name: "customerId", type: sql.UniqueIdentifier, value: customerId },
          { name: "businessId", type: sql.UniqueIdentifier, value: params.businessId },
          { name: "fullName", type: sql.NVarChar(200), value: params.fullName.trim() },
          { name: "phone", type: sql.NVarChar(32), value: phone },
          { name: "email", type: sql.NVarChar(320), value: params.email?.trim() || null },
          { name: "source", type: sql.NVarChar(64), value: params.source ?? "MANUAL" },
          { name: "status", type: sql.NVarChar(32), value: params.status ?? "ACTIVE" },
          {
            name: "assignedUserId",
            type: sql.UniqueIdentifier,
            value: params.assignedUserId ?? null,
          },
          {
            name: "erpId",
            type: sql.NVarChar(64),
            value: params.externalErpClientId ?? null,
          },
        ],
      );
      if (phone) {
        await upsertCustomerPhone(
          {
            businessId: params.businessId,
            customerId,
            phoneNormalized: phone,
            isPrimary: true,
          },
          trx,
        );
      }
      await insertActivity(
        {
          businessId: params.businessId,
          customerId,
          activityType: "CUSTOMER_CREATED",
          title: "تم إنشاء العميل",
          actorUserId: params.actorUserId ?? null,
        },
        trx,
      );
    });
  } catch (error) {
    if (isUniqueViolationError(error) || (error instanceof Error && /Unique constraint/i.test(error.message))) {
      throw new ConflictError("يوجد عميل بنفس رقم الهاتف أو معرف الـ ERP");
    }
    throw error;
  }
  const created = await getCustomerById({ businessId: params.businessId, customerId });
  if (!created) throw new NotFoundError("تعذر قراءة العميل بعد الإنشاء");
  return created;
}

export async function updateCustomer(params: {
  businessId: string;
  customerId: string;
  fullName?: string;
  primaryPhoneNormalized?: string | null;
  email?: string | null;
  status?: CrmCustomerStatus;
  assignedUserId?: string | null;
  externalErpClientId?: string | null;
  lastInteractionAtUtc?: Date | string | null;
  actorUserId?: string | null;
}): Promise<CrmCustomer> {
  const existing = await getCustomerById(params);
  if (!existing) throw new NotFoundError("العميل غير موجود");

  let phone = existing.primaryPhoneNormalized;
  if (params.primaryPhoneNormalized !== undefined) {
    if (params.primaryPhoneNormalized === null || params.primaryPhoneNormalized === "") {
      phone = null;
    } else {
      phone = normalizeCrmPhone(params.primaryPhoneNormalized);
      if (!phone) throw new ValidationError("رقم الهاتف غير صالح");
    }
  }

  try {
    await withTransaction(async (trx) => {
      await trx.query(
        `UPDATE dbo.TblCrmCustomer
         SET FullName = @fullName,
             PrimaryPhoneNormalized = @phone,
             Email = @email,
             Status = @status,
             AssignedUserID = @assignedUserId,
             ExternalErpClientId = @erpId,
             LastInteractionAtUtc = COALESCE(@lastInteraction, LastInteractionAtUtc),
             UpdatedAtUtc = SYSUTCDATETIME()
         WHERE BusinessID = @businessId AND CustomerID = @customerId AND Status <> N'MERGED'`,
        [
          { name: "businessId", type: sql.UniqueIdentifier, value: params.businessId },
          { name: "customerId", type: sql.UniqueIdentifier, value: params.customerId },
          {
            name: "fullName",
            type: sql.NVarChar(200),
            value: (params.fullName ?? existing.fullName).trim(),
          },
          { name: "phone", type: sql.NVarChar(32), value: phone },
          {
            name: "email",
            type: sql.NVarChar(320),
            value: params.email !== undefined ? params.email?.trim() || null : existing.email,
          },
          {
            name: "status",
            type: sql.NVarChar(32),
            value: params.status ?? existing.status,
          },
          {
            name: "assignedUserId",
            type: sql.UniqueIdentifier,
            value:
              params.assignedUserId !== undefined
                ? params.assignedUserId
                : existing.assignedUserId,
          },
          {
            name: "erpId",
            type: sql.NVarChar(64),
            value:
              params.externalErpClientId !== undefined
                ? params.externalErpClientId
                : existing.externalErpClientId,
          },
          {
            name: "lastInteraction",
            type: sql.DateTime2,
            value: params.lastInteractionAtUtc
              ? new Date(params.lastInteractionAtUtc)
              : null,
          },
        ],
      );
      if (phone && phone !== existing.primaryPhoneNormalized) {
        await upsertCustomerPhone(
          {
            businessId: params.businessId,
            customerId: params.customerId,
            phoneNormalized: phone,
            isPrimary: true,
          },
          trx,
        );
      }
      const changes: string[] = [];
      if (params.status && params.status !== existing.status) changes.push("STATUS_CHANGED");
      if (
        params.assignedUserId !== undefined
        && params.assignedUserId !== existing.assignedUserId
      ) {
        changes.push("ASSIGNED");
      }
      await insertActivity(
        {
          businessId: params.businessId,
          customerId: params.customerId,
          activityType: changes.includes("STATUS_CHANGED")
            ? "STATUS_CHANGED"
            : changes.includes("ASSIGNED")
              ? "ASSIGNED"
              : "CUSTOMER_UPDATED",
          title: "تم تحديث بيانات العميل",
          actorUserId: params.actorUserId ?? null,
        },
        trx,
      );
    });
  } catch (error) {
    if (isUniqueViolationError(error) || (error instanceof Error && /Unique constraint/i.test(error.message))) {
      throw new ConflictError("يوجد عميل بنفس رقم الهاتف أو معرف الـ ERP");
    }
    throw error;
  }
  const updated = await getCustomerById(params);
  if (!updated) throw new NotFoundError("العميل غير موجود");
  return updated;
}

export async function mergeCustomers(params: {
  businessId: string;
  survivorCustomerId: string;
  mergedCustomerId: string;
  actorUserId?: string | null;
}): Promise<CrmCustomer> {
  if (params.survivorCustomerId === params.mergedCustomerId) {
    throw new ValidationError("لا يمكن دمج العميل مع نفسه");
  }
  await withTransaction(async (trx) => {
    const rows = await trx.query<CustomerRow>(
      `SELECT ${CUSTOMER_SELECT}
       FROM dbo.TblCrmCustomer c
       LEFT JOIN dbo.TblUser u ON u.UserID = c.AssignedUserID
       WHERE c.BusinessID = @businessId
         AND c.CustomerID IN (@survivorId, @mergedId)`,
      [
        { name: "businessId", type: sql.UniqueIdentifier, value: params.businessId },
        { name: "survivorId", type: sql.UniqueIdentifier, value: params.survivorCustomerId },
        { name: "mergedId", type: sql.UniqueIdentifier, value: params.mergedCustomerId },
      ],
    );
    if (rows.recordset.length !== 2) {
      throw new NotFoundError("أحد العملاء غير موجود");
    }
    await trx.query(
      `UPDATE dbo.TblCrmCustomerPhone SET CustomerID = @survivorId
       WHERE BusinessID = @businessId AND CustomerID = @mergedId
         AND PhoneNormalized NOT IN (
           SELECT PhoneNormalized FROM dbo.TblCrmCustomerPhone
           WHERE BusinessID = @businessId AND CustomerID = @survivorId
         )`,
      [
        { name: "businessId", type: sql.UniqueIdentifier, value: params.businessId },
        { name: "survivorId", type: sql.UniqueIdentifier, value: params.survivorCustomerId },
        { name: "mergedId", type: sql.UniqueIdentifier, value: params.mergedCustomerId },
      ],
    );
    await trx.query(
      `DELETE FROM dbo.TblCrmCustomerPhone
       WHERE BusinessID = @businessId AND CustomerID = @mergedId`,
      [
        { name: "businessId", type: sql.UniqueIdentifier, value: params.businessId },
        { name: "mergedId", type: sql.UniqueIdentifier, value: params.mergedCustomerId },
      ],
    );
    await trx.query(
      `UPDATE dbo.TblCrmContactLink SET CustomerID = @survivorId, LinkSource = N'MERGE'
       WHERE BusinessID = @businessId AND CustomerID = @mergedId
         AND ContactID NOT IN (
           SELECT ContactID FROM dbo.TblCrmContactLink
           WHERE BusinessID = @businessId AND CustomerID = @survivorId
         )`,
      [
        { name: "businessId", type: sql.UniqueIdentifier, value: params.businessId },
        { name: "survivorId", type: sql.UniqueIdentifier, value: params.survivorCustomerId },
        { name: "mergedId", type: sql.UniqueIdentifier, value: params.mergedCustomerId },
      ],
    );
    await trx.query(
      `DELETE FROM dbo.TblCrmContactLink WHERE BusinessID = @businessId AND CustomerID = @mergedId`,
      [
        { name: "businessId", type: sql.UniqueIdentifier, value: params.businessId },
        { name: "mergedId", type: sql.UniqueIdentifier, value: params.mergedCustomerId },
      ],
    );
    await trx.query(
      `UPDATE dbo.TblCrmNote SET CustomerID = @survivorId
       WHERE BusinessID = @businessId AND CustomerID = @mergedId`,
      [
        { name: "businessId", type: sql.UniqueIdentifier, value: params.businessId },
        { name: "survivorId", type: sql.UniqueIdentifier, value: params.survivorCustomerId },
        { name: "mergedId", type: sql.UniqueIdentifier, value: params.mergedCustomerId },
      ],
    );
    await trx.query(
      `UPDATE dbo.TblCrmFollowUp SET CustomerID = @survivorId
       WHERE BusinessID = @businessId AND CustomerID = @mergedId`,
      [
        { name: "businessId", type: sql.UniqueIdentifier, value: params.businessId },
        { name: "survivorId", type: sql.UniqueIdentifier, value: params.survivorCustomerId },
        { name: "mergedId", type: sql.UniqueIdentifier, value: params.mergedCustomerId },
      ],
    );
    await trx.query(
      `UPDATE dbo.TblCrmActivity SET CustomerID = @survivorId
       WHERE BusinessID = @businessId AND CustomerID = @mergedId`,
      [
        { name: "businessId", type: sql.UniqueIdentifier, value: params.businessId },
        { name: "survivorId", type: sql.UniqueIdentifier, value: params.survivorCustomerId },
        { name: "mergedId", type: sql.UniqueIdentifier, value: params.mergedCustomerId },
      ],
    );
    await trx.query(
      `UPDATE dbo.TblErpInvoiceMirror SET CustomerID = @survivorId
       WHERE BusinessID = @businessId AND CustomerID = @mergedId`,
      [
        { name: "businessId", type: sql.UniqueIdentifier, value: params.businessId },
        { name: "survivorId", type: sql.UniqueIdentifier, value: params.survivorCustomerId },
        { name: "mergedId", type: sql.UniqueIdentifier, value: params.mergedCustomerId },
      ],
    );
    await trx.query(
      `INSERT INTO dbo.TblCrmCustomerTag (CustomerID, TagID, BusinessID)
       SELECT @survivorId, TagID, BusinessID
       FROM dbo.TblCrmCustomerTag
       WHERE BusinessID = @businessId AND CustomerID = @mergedId
         AND TagID NOT IN (
           SELECT TagID FROM dbo.TblCrmCustomerTag
           WHERE BusinessID = @businessId AND CustomerID = @survivorId
         )`,
      [
        { name: "businessId", type: sql.UniqueIdentifier, value: params.businessId },
        { name: "survivorId", type: sql.UniqueIdentifier, value: params.survivorCustomerId },
        { name: "mergedId", type: sql.UniqueIdentifier, value: params.mergedCustomerId },
      ],
    );
    await trx.query(
      `DELETE FROM dbo.TblCrmCustomerTag WHERE BusinessID = @businessId AND CustomerID = @mergedId`,
      [
        { name: "businessId", type: sql.UniqueIdentifier, value: params.businessId },
        { name: "mergedId", type: sql.UniqueIdentifier, value: params.mergedCustomerId },
      ],
    );
    const survivor = rows.recordset.find(
      (r) => normalizeUuid(r.CustomerID) === params.survivorCustomerId,
    )!;
    const merged = rows.recordset.find(
      (r) => normalizeUuid(r.CustomerID) === params.mergedCustomerId,
    )!;
    const erpId = survivor.ExternalErpClientId ?? merged.ExternalErpClientId;
    await trx.query(
      `UPDATE dbo.TblCrmCustomer
       SET ExternalErpClientId = COALESCE(ExternalErpClientId, @erpId),
           PrimaryPhoneNormalized = COALESCE(PrimaryPhoneNormalized, @phone),
           Email = COALESCE(Email, @email),
           AssignedUserID = COALESCE(AssignedUserID, @assigned),
           UpdatedAtUtc = SYSUTCDATETIME()
       WHERE BusinessID = @businessId AND CustomerID = @survivorId`,
      [
        { name: "businessId", type: sql.UniqueIdentifier, value: params.businessId },
        { name: "survivorId", type: sql.UniqueIdentifier, value: params.survivorCustomerId },
        { name: "erpId", type: sql.NVarChar(64), value: erpId },
        { name: "phone", type: sql.NVarChar(32), value: merged.PrimaryPhoneNormalized },
        { name: "email", type: sql.NVarChar(320), value: merged.Email },
        { name: "assigned", type: sql.UniqueIdentifier, value: merged.AssignedUserID },
      ],
    );
    await trx.query(
      `UPDATE dbo.TblCrmCustomer
       SET Status = N'MERGED',
           MergedIntoCustomerID = @survivorId,
           PrimaryPhoneNormalized = NULL,
           ExternalErpClientId = NULL,
           UpdatedAtUtc = SYSUTCDATETIME()
       WHERE BusinessID = @businessId AND CustomerID = @mergedId`,
      [
        { name: "businessId", type: sql.UniqueIdentifier, value: params.businessId },
        { name: "survivorId", type: sql.UniqueIdentifier, value: params.survivorCustomerId },
        { name: "mergedId", type: sql.UniqueIdentifier, value: params.mergedCustomerId },
      ],
    );
    await insertActivity(
      {
        businessId: params.businessId,
        customerId: params.survivorCustomerId,
        activityType: "MERGED",
        title: "تم دمج عميل مكرر",
        body: params.mergedCustomerId,
        actorUserId: params.actorUserId ?? null,
        relatedEntityType: "CUSTOMER",
        relatedEntityId: params.mergedCustomerId,
      },
      trx,
    );
  });
  const survivor = await getCustomerById({
    businessId: params.businessId,
    customerId: params.survivorCustomerId,
  });
  if (!survivor) throw new NotFoundError("العميل غير موجود");
  return survivor;
}

export async function upsertCustomerPhone(
  params: {
    businessId: string;
    customerId: string;
    phoneNormalized: string;
    label?: string | null;
    isPrimary?: boolean;
  },
  trx?: TransactionClient,
): Promise<void> {
  const phone = normalizeCrmPhone(params.phoneNormalized) ?? params.phoneNormalized;
  const run = trx?.query.bind(trx) ?? query;
  if (params.isPrimary) {
    await run(
      `UPDATE dbo.TblCrmCustomerPhone SET IsPrimary = 0
       WHERE BusinessID = @businessId AND CustomerID = @customerId`,
      [
        { name: "businessId", type: sql.UniqueIdentifier, value: params.businessId },
        { name: "customerId", type: sql.UniqueIdentifier, value: params.customerId },
      ],
    );
  }
  await run(
    `MERGE dbo.TblCrmCustomerPhone WITH (HOLDLOCK) AS target
     USING (SELECT @businessId AS BusinessID, @phone AS PhoneNormalized) AS src
       ON target.BusinessID = src.BusinessID AND target.PhoneNormalized = src.PhoneNormalized
     WHEN MATCHED THEN
       UPDATE SET CustomerID = @customerId,
                  Label = COALESCE(@label, target.Label),
                  IsPrimary = CASE WHEN @isPrimary = 1 THEN 1 ELSE target.IsPrimary END
     WHEN NOT MATCHED THEN
       INSERT (CustomerPhoneID, BusinessID, CustomerID, PhoneNormalized, Label, IsPrimary)
       VALUES (@id, @businessId, @customerId, @phone, @label, @isPrimary);`,
    [
      { name: "id", type: sql.UniqueIdentifier, value: randomUUID() },
      { name: "businessId", type: sql.UniqueIdentifier, value: params.businessId },
      { name: "customerId", type: sql.UniqueIdentifier, value: params.customerId },
      { name: "phone", type: sql.NVarChar(32), value: phone },
      { name: "label", type: sql.NVarChar(64), value: params.label ?? null },
      { name: "isPrimary", type: sql.Bit, value: params.isPrimary ? 1 : 0 },
    ],
  );
}

export async function listCustomerPhones(params: {
  businessId: string;
  customerId: string;
}): Promise<Array<{ phoneNormalized: string; label: string | null; isPrimary: boolean }>> {
  const result = await query<{
    PhoneNormalized: string;
    Label: string | null;
    IsPrimary: boolean;
  }>(
    `SELECT PhoneNormalized, Label, IsPrimary
     FROM dbo.TblCrmCustomerPhone
     WHERE BusinessID = @businessId AND CustomerID = @customerId
     ORDER BY IsPrimary DESC, CreatedAtUtc`,
    [
      { name: "businessId", type: sql.UniqueIdentifier, value: params.businessId },
      { name: "customerId", type: sql.UniqueIdentifier, value: params.customerId },
    ],
  );
  return result.recordset.map((row) => ({
    phoneNormalized: row.PhoneNormalized,
    label: row.Label,
    isPrimary: Boolean(row.IsPrimary),
  }));
}

export async function listTags(params: { businessId: string }): Promise<CrmTag[]> {
  const result = await query<TagRow>(
    `SELECT TagID, Name, Color FROM dbo.TblCrmTag
     WHERE BusinessID = @businessId ORDER BY Name`,
    [{ name: "businessId", type: sql.UniqueIdentifier, value: params.businessId }],
  );
  return result.recordset.map(mapTag);
}

export async function ensureTag(params: {
  businessId: string;
  name: string;
  color?: string | null;
}): Promise<CrmTag> {
  const name = params.name.trim();
  if (!name) throw new ValidationError("اسم الوسم مطلوب");
  const existing = await query<TagRow>(
    `SELECT TagID, Name, Color FROM dbo.TblCrmTag
     WHERE BusinessID = @businessId AND Name = @name`,
    [
      { name: "businessId", type: sql.UniqueIdentifier, value: params.businessId },
      { name: "name", type: sql.NVarChar(80), value: name },
    ],
  );
  if (existing.recordset[0]) return mapTag(existing.recordset[0]);
  const tagId = randomUUID();
  try {
    await query(
      `INSERT INTO dbo.TblCrmTag (TagID, BusinessID, Name, Color)
       VALUES (@tagId, @businessId, @name, @color)`,
      [
        { name: "tagId", type: sql.UniqueIdentifier, value: tagId },
        { name: "businessId", type: sql.UniqueIdentifier, value: params.businessId },
        { name: "name", type: sql.NVarChar(80), value: name },
        { name: "color", type: sql.NVarChar(32), value: params.color ?? null },
      ],
    );
  } catch (error) {
    if (isUniqueViolationError(error)) {
      const again = await query<TagRow>(
        `SELECT TagID, Name, Color FROM dbo.TblCrmTag
         WHERE BusinessID = @businessId AND Name = @name`,
        [
          { name: "businessId", type: sql.UniqueIdentifier, value: params.businessId },
          { name: "name", type: sql.NVarChar(80), value: name },
        ],
      );
      if (again.recordset[0]) return mapTag(again.recordset[0]);
    }
    throw error;
  }
  return { tagId, name, color: params.color ?? null };
}

export async function attachTag(params: {
  businessId: string;
  customerId: string;
  tagId: string;
  actorUserId?: string | null;
}): Promise<void> {
  const tag = await query<TagRow>(
    `SELECT TagID, Name, Color FROM dbo.TblCrmTag
     WHERE BusinessID = @businessId AND TagID = @tagId`,
    [
      { name: "businessId", type: sql.UniqueIdentifier, value: params.businessId },
      { name: "tagId", type: sql.UniqueIdentifier, value: params.tagId },
    ],
  );
  if (!tag.recordset[0]) throw new NotFoundError("الوسم غير موجود");
  await query(
    `IF NOT EXISTS (
       SELECT 1 FROM dbo.TblCrmCustomerTag
       WHERE CustomerID = @customerId AND TagID = @tagId
     )
     INSERT INTO dbo.TblCrmCustomerTag (CustomerID, TagID, BusinessID)
     VALUES (@customerId, @tagId, @businessId)`,
    [
      { name: "businessId", type: sql.UniqueIdentifier, value: params.businessId },
      { name: "customerId", type: sql.UniqueIdentifier, value: params.customerId },
      { name: "tagId", type: sql.UniqueIdentifier, value: params.tagId },
    ],
  );
  await insertActivity({
    businessId: params.businessId,
    customerId: params.customerId,
    activityType: "TAG_ADDED",
    title: `تمت إضافة وسم: ${tag.recordset[0].Name}`,
    actorUserId: params.actorUserId ?? null,
    relatedEntityType: "TAG",
    relatedEntityId: params.tagId,
  });
}

export async function detachTag(params: {
  businessId: string;
  customerId: string;
  tagId: string;
  actorUserId?: string | null;
}): Promise<void> {
  await query(
    `DELETE FROM dbo.TblCrmCustomerTag
     WHERE BusinessID = @businessId AND CustomerID = @customerId AND TagID = @tagId`,
    [
      { name: "businessId", type: sql.UniqueIdentifier, value: params.businessId },
      { name: "customerId", type: sql.UniqueIdentifier, value: params.customerId },
      { name: "tagId", type: sql.UniqueIdentifier, value: params.tagId },
    ],
  );
  await insertActivity({
    businessId: params.businessId,
    customerId: params.customerId,
    activityType: "TAG_REMOVED",
    title: "تمت إزالة وسم",
    actorUserId: params.actorUserId ?? null,
    relatedEntityType: "TAG",
    relatedEntityId: params.tagId,
  });
}

export async function linkContactToCustomer(params: {
  businessId: string;
  customerId: string;
  contactId: string;
  linkSource?: "PHONE_MATCH" | "MANUAL" | "IMPORT" | "MERGE";
}): Promise<void> {
  await query(
    `MERGE dbo.TblCrmContactLink WITH (HOLDLOCK) AS target
     USING (SELECT @businessId AS BusinessID, @contactId AS ContactID) AS src
       ON target.BusinessID = src.BusinessID AND target.ContactID = src.ContactID
     WHEN MATCHED THEN
       UPDATE SET CustomerID = @customerId, LinkSource = @linkSource
     WHEN NOT MATCHED THEN
       INSERT (ContactLinkID, BusinessID, CustomerID, ContactID, LinkSource)
       VALUES (@id, @businessId, @customerId, @contactId, @linkSource);`,
    [
      { name: "id", type: sql.UniqueIdentifier, value: randomUUID() },
      { name: "businessId", type: sql.UniqueIdentifier, value: params.businessId },
      { name: "customerId", type: sql.UniqueIdentifier, value: params.customerId },
      { name: "contactId", type: sql.UniqueIdentifier, value: params.contactId },
      { name: "linkSource", type: sql.NVarChar(32), value: params.linkSource ?? "PHONE_MATCH" },
    ],
  );
}

export async function getCustomerIdByContactId(params: {
  businessId: string;
  contactId: string;
}): Promise<string | null> {
  const result = await query<{ CustomerID: string }>(
    `SELECT CustomerID FROM dbo.TblCrmContactLink
     WHERE BusinessID = @businessId AND ContactID = @contactId`,
    [
      { name: "businessId", type: sql.UniqueIdentifier, value: params.businessId },
      { name: "contactId", type: sql.UniqueIdentifier, value: params.contactId },
    ],
  );
  return result.recordset[0]
    ? normalizeUuid(result.recordset[0].CustomerID)
    : null;
}

export async function listCustomerConversations(params: {
  businessId: string;
  customerId: string;
}): Promise<CrmConversationLink[]> {
  const result = await query<{
    ConversationID: string;
    ContactID: string;
    Status: string;
    LastMessageAtUtc: Date | null;
    LastMessagePreview: string | null;
    ContactDisplayName: string | null;
    ContactPhoneNormalized: string | null;
  }>(
    `SELECT c.ConversationID, c.ContactID, c.Status, c.LastMessageAtUtc,
            (
              SELECT TOP 1 m.TextContent FROM dbo.TblMessage m
              WHERE m.BusinessID = c.BusinessID AND m.ConversationID = c.ConversationID
              ORDER BY ISNULL(m.ProviderTimestampUtc, m.CreatedAtUtc) DESC, m.CreatedAtUtc DESC
            ) AS LastMessagePreview,
            ct.DisplayName AS ContactDisplayName,
            ct.PhoneNormalized AS ContactPhoneNormalized
     FROM dbo.TblCrmContactLink link
     INNER JOIN dbo.TblConversation c
       ON c.BusinessID = link.BusinessID AND c.ContactID = link.ContactID
     INNER JOIN dbo.TblContact ct
       ON ct.BusinessID = link.BusinessID AND ct.ContactID = link.ContactID
     WHERE link.BusinessID = @businessId AND link.CustomerID = @customerId
     ORDER BY ISNULL(c.LastMessageAtUtc, c.CreatedAtUtc) DESC`,
    [
      { name: "businessId", type: sql.UniqueIdentifier, value: params.businessId },
      { name: "customerId", type: sql.UniqueIdentifier, value: params.customerId },
    ],
  );
  return result.recordset.map((row) => ({
    conversationId: normalizeUuid(row.ConversationID),
    contactId: normalizeUuid(row.ContactID),
    status: row.Status,
    lastMessageAtUtc: toIso(row.LastMessageAtUtc),
    lastMessagePreview: row.LastMessagePreview,
    contactDisplayName: row.ContactDisplayName,
    contactPhoneNormalized: row.ContactPhoneNormalized,
  }));
}

export async function listNotes(params: {
  businessId: string;
  customerId: string;
}): Promise<CrmNote[]> {
  const result = await query<{
    NoteID: string;
    CustomerID: string;
    Body: string;
    CreatedByUserID: string;
    CreatedByName: string | null;
    UpdatedByUserID: string | null;
    CreatedAtUtc: Date;
    UpdatedAtUtc: Date;
  }>(
    `SELECT n.NoteID, n.CustomerID, n.Body, n.CreatedByUserID, u.FullName AS CreatedByName,
            n.UpdatedByUserID, n.CreatedAtUtc, n.UpdatedAtUtc
     FROM dbo.TblCrmNote n
     LEFT JOIN dbo.TblUser u ON u.UserID = n.CreatedByUserID
     WHERE n.BusinessID = @businessId AND n.CustomerID = @customerId
     ORDER BY n.CreatedAtUtc DESC`,
    [
      { name: "businessId", type: sql.UniqueIdentifier, value: params.businessId },
      { name: "customerId", type: sql.UniqueIdentifier, value: params.customerId },
    ],
  );
  return result.recordset.map((row) => ({
    noteId: normalizeUuid(row.NoteID),
    customerId: normalizeUuid(row.CustomerID),
    body: row.Body,
    createdByUserId: normalizeUuid(row.CreatedByUserID),
    createdByName: row.CreatedByName,
    updatedByUserId: normalizeNullableUuid(row.UpdatedByUserID),
    createdAtUtc: toIsoRequired(row.CreatedAtUtc),
    updatedAtUtc: toIsoRequired(row.UpdatedAtUtc),
  }));
}

export async function createNote(params: {
  businessId: string;
  customerId: string;
  body: string;
  createdByUserId: string;
}): Promise<CrmNote> {
  const body = params.body.trim();
  if (!body) throw new ValidationError("نص الملاحظة مطلوب");
  const noteId = randomUUID();
  await withTransaction(async (trx) => {
    await trx.query(
      `INSERT INTO dbo.TblCrmNote (NoteID, BusinessID, CustomerID, Body, CreatedByUserID)
       VALUES (@noteId, @businessId, @customerId, @body, @userId)`,
      [
        { name: "noteId", type: sql.UniqueIdentifier, value: noteId },
        { name: "businessId", type: sql.UniqueIdentifier, value: params.businessId },
        { name: "customerId", type: sql.UniqueIdentifier, value: params.customerId },
        { name: "body", type: sql.NVarChar(4000), value: body },
        { name: "userId", type: sql.UniqueIdentifier, value: params.createdByUserId },
      ],
    );
    await insertActivity(
      {
        businessId: params.businessId,
        customerId: params.customerId,
        activityType: "NOTE_ADDED",
        title: "تمت إضافة ملاحظة",
        actorUserId: params.createdByUserId,
        relatedEntityType: "NOTE",
        relatedEntityId: noteId,
      },
      trx,
    );
  });
  const notes = await listNotes(params);
  const note = notes.find((n) => n.noteId === noteId);
  if (!note) throw new NotFoundError("تعذر قراءة الملاحظة");
  return note;
}

export async function updateNote(params: {
  businessId: string;
  customerId: string;
  noteId: string;
  body: string;
  updatedByUserId: string;
}): Promise<CrmNote> {
  const body = params.body.trim();
  if (!body) throw new ValidationError("نص الملاحظة مطلوب");
  const updated = await query(
    `UPDATE dbo.TblCrmNote
     SET Body = @body, UpdatedByUserID = @userId, UpdatedAtUtc = SYSUTCDATETIME()
     WHERE BusinessID = @businessId AND CustomerID = @customerId AND NoteID = @noteId`,
    [
      { name: "businessId", type: sql.UniqueIdentifier, value: params.businessId },
      { name: "customerId", type: sql.UniqueIdentifier, value: params.customerId },
      { name: "noteId", type: sql.UniqueIdentifier, value: params.noteId },
      { name: "body", type: sql.NVarChar(4000), value: body },
      { name: "userId", type: sql.UniqueIdentifier, value: params.updatedByUserId },
    ],
  );
  if (!updated.rowsAffected[0]) throw new NotFoundError("الملاحظة غير موجودة");
  await insertActivity({
    businessId: params.businessId,
    customerId: params.customerId,
    activityType: "NOTE_UPDATED",
    title: "تم تحديث ملاحظة",
    actorUserId: params.updatedByUserId,
    relatedEntityType: "NOTE",
    relatedEntityId: params.noteId,
  });
  const notes = await listNotes(params);
  const note = notes.find((n) => n.noteId === params.noteId);
  if (!note) throw new NotFoundError("الملاحظة غير موجودة");
  return note;
}

export async function insertActivity(
  params: {
    businessId: string;
    customerId: string;
    activityType: string;
    title: string;
    body?: string | null;
    actorUserId?: string | null;
    relatedEntityType?: string | null;
    relatedEntityId?: string | null;
    occurredAtUtc?: Date | null;
  },
  trx?: TransactionClient,
): Promise<void> {
  const run = trx?.query.bind(trx) ?? query;
  await run(
    `INSERT INTO dbo.TblCrmActivity (
       ActivityID, BusinessID, CustomerID, ActivityType, Title, Body,
       ActorUserID, RelatedEntityType, RelatedEntityID, OccurredAtUtc
     ) VALUES (
       @id, @businessId, @customerId, @type, @title, @body,
       @actor, @relType, @relId, COALESCE(@occurred, SYSUTCDATETIME())
     )`,
    [
      { name: "id", type: sql.UniqueIdentifier, value: randomUUID() },
      { name: "businessId", type: sql.UniqueIdentifier, value: params.businessId },
      { name: "customerId", type: sql.UniqueIdentifier, value: params.customerId },
      { name: "type", type: sql.NVarChar(64), value: params.activityType },
      { name: "title", type: sql.NVarChar(300), value: params.title },
      { name: "body", type: sql.NVarChar(2000), value: params.body ?? null },
      { name: "actor", type: sql.UniqueIdentifier, value: params.actorUserId ?? null },
      { name: "relType", type: sql.NVarChar(64), value: params.relatedEntityType ?? null },
      { name: "relId", type: sql.NVarChar(128), value: params.relatedEntityId ?? null },
      { name: "occurred", type: sql.DateTime2, value: params.occurredAtUtc ?? null },
    ],
  );
}

export async function listActivities(params: {
  businessId: string;
  customerId: string;
  limit?: number;
}): Promise<CrmActivity[]> {
  const limit = Math.min(200, Math.max(1, params.limit ?? 50));
  const result = await query<{
    ActivityID: string;
    CustomerID: string;
    ActivityType: string;
    Title: string;
    Body: string | null;
    ActorUserID: string | null;
    ActorName: string | null;
    RelatedEntityType: string | null;
    RelatedEntityID: string | null;
    OccurredAtUtc: Date;
  }>(
    `SELECT TOP (@limit)
       a.ActivityID, a.CustomerID, a.ActivityType, a.Title, a.Body,
       a.ActorUserID, u.FullName AS ActorName,
       a.RelatedEntityType, a.RelatedEntityID, a.OccurredAtUtc
     FROM dbo.TblCrmActivity a
     LEFT JOIN dbo.TblUser u ON u.UserID = a.ActorUserID
     WHERE a.BusinessID = @businessId AND a.CustomerID = @customerId
     ORDER BY a.OccurredAtUtc DESC`,
    [
      { name: "businessId", type: sql.UniqueIdentifier, value: params.businessId },
      { name: "customerId", type: sql.UniqueIdentifier, value: params.customerId },
      { name: "limit", type: sql.Int, value: limit },
    ],
  );
  return result.recordset.map((row) => ({
    activityId: normalizeUuid(row.ActivityID),
    customerId: normalizeUuid(row.CustomerID),
    activityType: row.ActivityType,
    title: row.Title,
    body: row.Body,
    actorUserId: normalizeNullableUuid(row.ActorUserID),
    actorName: row.ActorName,
    relatedEntityType: row.RelatedEntityType,
    relatedEntityId: row.RelatedEntityID,
    occurredAtUtc: toIsoRequired(row.OccurredAtUtc),
  }));
}

function mapFollowUp(row: {
  FollowUpID: string;
  CustomerID: string;
  CustomerName: string | null;
  AssignedUserID: string | null;
  AssignedUserName: string | null;
  ConversationID: string | null;
  Title: string;
  Description: string | null;
  DueAtUtc: Date | null;
  Priority: string;
  Status: string;
  CompletedAtUtc: Date | null;
  CreatedByUserID: string;
  CreatedAtUtc: Date;
  UpdatedAtUtc: Date;
}): CrmFollowUp {
  return {
    followUpId: normalizeUuid(row.FollowUpID),
    customerId: normalizeUuid(row.CustomerID),
    customerName: row.CustomerName,
    assignedUserId: normalizeNullableUuid(row.AssignedUserID),
    assignedUserName: row.AssignedUserName,
    conversationId: normalizeNullableUuid(row.ConversationID),
    title: row.Title,
    description: row.Description,
    dueAtUtc: toIso(row.DueAtUtc),
    priority: row.Priority as CrmFollowUpPriority,
    status: row.Status as CrmFollowUpStatus,
    completedAtUtc: toIso(row.CompletedAtUtc),
    createdByUserId: normalizeUuid(row.CreatedByUserID),
    createdAtUtc: toIsoRequired(row.CreatedAtUtc),
    updatedAtUtc: toIsoRequired(row.UpdatedAtUtc),
  };
}

const FOLLOWUP_SELECT = `
  f.FollowUpID, f.CustomerID, c.FullName AS CustomerName,
  f.AssignedUserID, u.FullName AS AssignedUserName, f.ConversationID,
  f.Title, f.Description, f.DueAtUtc, f.Priority, f.Status, f.CompletedAtUtc,
  f.CreatedByUserID, f.CreatedAtUtc, f.UpdatedAtUtc
`;

export async function listFollowUps(params: {
  businessId: string;
  customerId?: string | null;
  assignedUserId?: string | null;
  status?: CrmFollowUpStatus | null;
  page?: number;
  pageSize?: number;
}): Promise<{ items: CrmFollowUp[]; total: number; page: number; pageSize: number }> {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 25));
  const offset = (page - 1) * pageSize;
  const inputs: QueryInput[] = [
    { name: "businessId", type: sql.UniqueIdentifier, value: params.businessId },
    { name: "offset", type: sql.Int, value: offset },
    { name: "pageSize", type: sql.Int, value: pageSize },
  ];
  const where = ["f.BusinessID = @businessId"];
  if (params.customerId) {
    inputs.push({ name: "customerId", type: sql.UniqueIdentifier, value: params.customerId });
    where.push("f.CustomerID = @customerId");
  }
  if (params.assignedUserId) {
    inputs.push({
      name: "assignedUserId",
      type: sql.UniqueIdentifier,
      value: params.assignedUserId,
    });
    where.push("f.AssignedUserID = @assignedUserId");
  }
  if (params.status) {
    inputs.push({ name: "status", type: sql.NVarChar(32), value: params.status });
    where.push("f.Status = @status");
  }
  const whereSql = where.join(" AND ");
  const count = await query<{ Total: number }>(
    `SELECT COUNT(1) AS Total FROM dbo.TblCrmFollowUp f WHERE ${whereSql}`,
    inputs.filter((i) => i.name !== "offset" && i.name !== "pageSize"),
  );
  const result = await query(
    `SELECT ${FOLLOWUP_SELECT}
     FROM dbo.TblCrmFollowUp f
     INNER JOIN dbo.TblCrmCustomer c ON c.CustomerID = f.CustomerID AND c.BusinessID = f.BusinessID
     LEFT JOIN dbo.TblUser u ON u.UserID = f.AssignedUserID
     WHERE ${whereSql}
     ORDER BY CASE WHEN f.Status IN (N'OPEN', N'IN_PROGRESS') THEN 0 ELSE 1 END,
              f.DueAtUtc ASC, f.CreatedAtUtc DESC
     OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY`,
    inputs,
  );
  return {
    items: result.recordset.map((row) => mapFollowUp(row as Parameters<typeof mapFollowUp>[0])),
    total: Number(count.recordset[0]?.Total ?? 0),
    page,
    pageSize,
  };
}

export async function getFollowUp(params: {
  businessId: string;
  followUpId: string;
}): Promise<CrmFollowUp | null> {
  const result = await query(
    `SELECT ${FOLLOWUP_SELECT}
     FROM dbo.TblCrmFollowUp f
     INNER JOIN dbo.TblCrmCustomer c ON c.CustomerID = f.CustomerID AND c.BusinessID = f.BusinessID
     LEFT JOIN dbo.TblUser u ON u.UserID = f.AssignedUserID
     WHERE f.BusinessID = @businessId AND f.FollowUpID = @followUpId`,
    [
      { name: "businessId", type: sql.UniqueIdentifier, value: params.businessId },
      { name: "followUpId", type: sql.UniqueIdentifier, value: params.followUpId },
    ],
  );
  const row = result.recordset[0];
  return row ? mapFollowUp(row as Parameters<typeof mapFollowUp>[0]) : null;
}

export async function createFollowUp(params: {
  businessId: string;
  customerId: string;
  title: string;
  description?: string | null;
  dueAtUtc?: string | null;
  priority?: CrmFollowUpPriority;
  assignedUserId?: string | null;
  conversationId?: string | null;
  createdByUserId: string;
}): Promise<CrmFollowUp> {
  const title = params.title.trim();
  if (!title) throw new ValidationError("عنوان المتابعة مطلوب");
  const followUpId = randomUUID();
  await withTransaction(async (trx) => {
    await trx.query(
      `INSERT INTO dbo.TblCrmFollowUp (
         FollowUpID, BusinessID, CustomerID, AssignedUserID, ConversationID,
         Title, Description, DueAtUtc, Priority, CreatedByUserID
       ) VALUES (
         @id, @businessId, @customerId, @assigned, @conversationId,
         @title, @description, @dueAt, @priority, @createdBy
       )`,
      [
        { name: "id", type: sql.UniqueIdentifier, value: followUpId },
        { name: "businessId", type: sql.UniqueIdentifier, value: params.businessId },
        { name: "customerId", type: sql.UniqueIdentifier, value: params.customerId },
        {
          name: "assigned",
          type: sql.UniqueIdentifier,
          value: params.assignedUserId ?? null,
        },
        {
          name: "conversationId",
          type: sql.UniqueIdentifier,
          value: params.conversationId ?? null,
        },
        { name: "title", type: sql.NVarChar(200), value: title },
        {
          name: "description",
          type: sql.NVarChar(2000),
          value: params.description?.trim() || null,
        },
        {
          name: "dueAt",
          type: sql.DateTime2,
          value: params.dueAtUtc ? new Date(params.dueAtUtc) : null,
        },
        { name: "priority", type: sql.NVarChar(16), value: params.priority ?? "MEDIUM" },
        { name: "createdBy", type: sql.UniqueIdentifier, value: params.createdByUserId },
      ],
    );
    await insertActivity(
      {
        businessId: params.businessId,
        customerId: params.customerId,
        activityType: "FOLLOWUP_CREATED",
        title: `متابعة: ${title}`,
        actorUserId: params.createdByUserId,
        relatedEntityType: "FOLLOWUP",
        relatedEntityId: followUpId,
      },
      trx,
    );
  });
  const created = await getFollowUp({ businessId: params.businessId, followUpId });
  if (!created) throw new NotFoundError("تعذر قراءة المتابعة");
  return created;
}

export async function updateFollowUp(params: {
  businessId: string;
  followUpId: string;
  title?: string;
  description?: string | null;
  dueAtUtc?: string | null;
  priority?: CrmFollowUpPriority;
  status?: CrmFollowUpStatus;
  assignedUserId?: string | null;
  actorUserId?: string | null;
}): Promise<CrmFollowUp> {
  const existing = await getFollowUp(params);
  if (!existing) throw new NotFoundError("المتابعة غير موجودة");
  const status = params.status ?? existing.status;
  const completing = status === "COMPLETED" && existing.status !== "COMPLETED";
  await query(
    `UPDATE dbo.TblCrmFollowUp
     SET Title = @title,
         Description = @description,
         DueAtUtc = @dueAt,
         Priority = @priority,
         Status = @status,
         AssignedUserID = @assigned,
         CompletedAtUtc = CASE
           WHEN @status = N'COMPLETED' AND CompletedAtUtc IS NULL THEN SYSUTCDATETIME()
           WHEN @status <> N'COMPLETED' THEN NULL
           ELSE CompletedAtUtc
         END,
         UpdatedAtUtc = SYSUTCDATETIME()
     WHERE BusinessID = @businessId AND FollowUpID = @followUpId`,
    [
      { name: "businessId", type: sql.UniqueIdentifier, value: params.businessId },
      { name: "followUpId", type: sql.UniqueIdentifier, value: params.followUpId },
      {
        name: "title",
        type: sql.NVarChar(200),
        value: (params.title ?? existing.title).trim(),
      },
      {
        name: "description",
        type: sql.NVarChar(2000),
        value:
          params.description !== undefined
            ? params.description?.trim() || null
            : existing.description,
      },
      {
        name: "dueAt",
        type: sql.DateTime2,
        value:
          params.dueAtUtc !== undefined
            ? params.dueAtUtc
              ? new Date(params.dueAtUtc)
              : null
            : existing.dueAtUtc
              ? new Date(existing.dueAtUtc)
              : null,
      },
      {
        name: "priority",
        type: sql.NVarChar(16),
        value: params.priority ?? existing.priority,
      },
      { name: "status", type: sql.NVarChar(32), value: status },
      {
        name: "assigned",
        type: sql.UniqueIdentifier,
        value:
          params.assignedUserId !== undefined
            ? params.assignedUserId
            : existing.assignedUserId,
      },
    ],
  );
  if (completing) {
    await insertActivity({
      businessId: params.businessId,
      customerId: existing.customerId,
      activityType: "FOLLOWUP_COMPLETED",
      title: `اكتملت المتابعة: ${existing.title}`,
      actorUserId: params.actorUserId ?? null,
      relatedEntityType: "FOLLOWUP",
      relatedEntityId: params.followUpId,
    });
  }
  const updated = await getFollowUp(params);
  if (!updated) throw new NotFoundError("المتابعة غير موجودة");
  return updated;
}

export async function listSegments(params: { businessId: string }): Promise<CrmSegment[]> {
  const result = await query<{
    SegmentID: string;
    Name: string;
    Description: string | null;
    FilterJson: string;
    ExplanationAr: string | null;
    CreatedAtUtc: Date;
    UpdatedAtUtc: Date;
  }>(
    `SELECT SegmentID, Name, Description, FilterJson, ExplanationAr, CreatedAtUtc, UpdatedAtUtc
     FROM dbo.TblCrmSegment
     WHERE BusinessID = @businessId
     ORDER BY UpdatedAtUtc DESC`,
    [{ name: "businessId", type: sql.UniqueIdentifier, value: params.businessId }],
  );
  return result.recordset.map((row) => ({
    segmentId: normalizeUuid(row.SegmentID),
    name: row.Name,
    description: row.Description,
    filterJson: row.FilterJson,
    explanationAr: row.ExplanationAr,
    createdAtUtc: toIsoRequired(row.CreatedAtUtc),
    updatedAtUtc: toIsoRequired(row.UpdatedAtUtc),
  }));
}

export async function getSegment(params: {
  businessId: string;
  segmentId: string;
}): Promise<CrmSegment | null> {
  const result = await query<{
    SegmentID: string;
    Name: string;
    Description: string | null;
    FilterJson: string;
    ExplanationAr: string | null;
    CreatedAtUtc: Date;
    UpdatedAtUtc: Date;
  }>(
    `SELECT SegmentID, Name, Description, FilterJson, ExplanationAr, CreatedAtUtc, UpdatedAtUtc
     FROM dbo.TblCrmSegment
     WHERE BusinessID = @businessId AND SegmentID = @segmentId`,
    [
      { name: "businessId", type: sql.UniqueIdentifier, value: params.businessId },
      { name: "segmentId", type: sql.UniqueIdentifier, value: params.segmentId },
    ],
  );
  const row = result.recordset[0];
  if (!row) return null;
  return {
    segmentId: normalizeUuid(row.SegmentID),
    name: row.Name,
    description: row.Description,
    filterJson: row.FilterJson,
    explanationAr: row.ExplanationAr,
    createdAtUtc: toIsoRequired(row.CreatedAtUtc),
    updatedAtUtc: toIsoRequired(row.UpdatedAtUtc),
  };
}

export async function upsertSegment(params: {
  businessId: string;
  segmentId?: string | null;
  name: string;
  description?: string | null;
  filterJson: string;
  explanationAr?: string | null;
  createdByUserId: string;
}): Promise<CrmSegment> {
  const name = params.name.trim();
  if (!name) throw new ValidationError("اسم الشريحة مطلوب");
  const segmentId = params.segmentId ?? randomUUID();
  try {
    if (params.segmentId) {
      const updated = await query(
        `UPDATE dbo.TblCrmSegment
         SET Name = @name, Description = @description, FilterJson = @filterJson,
             ExplanationAr = @explanationAr, UpdatedAtUtc = SYSUTCDATETIME()
         WHERE BusinessID = @businessId AND SegmentID = @segmentId`,
        [
          { name: "businessId", type: sql.UniqueIdentifier, value: params.businessId },
          { name: "segmentId", type: sql.UniqueIdentifier, value: segmentId },
          { name: "name", type: sql.NVarChar(160), value: name },
          {
            name: "description",
            type: sql.NVarChar(1000),
            value: params.description?.trim() || null,
          },
          { name: "filterJson", type: sql.NVarChar(sql.MAX), value: params.filterJson },
          {
            name: "explanationAr",
            type: sql.NVarChar(2000),
            value: params.explanationAr ?? null,
          },
        ],
      );
      if (!updated.rowsAffected[0]) throw new NotFoundError("الشريحة غير موجودة");
    } else {
      await query(
        `INSERT INTO dbo.TblCrmSegment (
           SegmentID, BusinessID, Name, Description, FilterJson, ExplanationAr, CreatedByUserID
         ) VALUES (
           @segmentId, @businessId, @name, @description, @filterJson, @explanationAr, @userId
         )`,
        [
          { name: "segmentId", type: sql.UniqueIdentifier, value: segmentId },
          { name: "businessId", type: sql.UniqueIdentifier, value: params.businessId },
          { name: "name", type: sql.NVarChar(160), value: name },
          {
            name: "description",
            type: sql.NVarChar(1000),
            value: params.description?.trim() || null,
          },
          { name: "filterJson", type: sql.NVarChar(sql.MAX), value: params.filterJson },
          {
            name: "explanationAr",
            type: sql.NVarChar(2000),
            value: params.explanationAr ?? null,
          },
          { name: "userId", type: sql.UniqueIdentifier, value: params.createdByUserId },
        ],
      );
    }
  } catch (error) {
    if (isUniqueViolationError(error)) {
      throw new ConflictError("يوجد شريحة بنفس الاسم");
    }
    throw error;
  }
  const segment = await getSegment({ businessId: params.businessId, segmentId });
  if (!segment) throw new NotFoundError("الشريحة غير موجودة");
  return segment;
}

export async function createAudienceSnapshot(params: {
  businessId: string;
  name: string;
  filterJson: string;
  segmentId?: string | null;
  createdByUserId: string;
  totalMatched: number;
  withPhone: number;
  eligibleMarketing: number;
  withoutPermission: number;
  members: Array<{
    customerId: string;
    phoneNormalized: string | null;
    marketingEligible: boolean;
    exclusionReason: string | null;
  }>;
}): Promise<{ snapshotId: string }> {
  const snapshotId = randomUUID();
  await withTransaction(async (trx) => {
    await trx.query(
      `INSERT INTO dbo.TblCrmAudienceSnapshot (
         SnapshotID, BusinessID, SegmentID, Name, FilterJson,
         TotalMatched, WithPhone, EligibleMarketing, WithoutPermission, CreatedByUserID
       ) VALUES (
         @snapshotId, @businessId, @segmentId, @name, @filterJson,
         @total, @withPhone, @eligible, @withoutPerm, @userId
       )`,
      [
        { name: "snapshotId", type: sql.UniqueIdentifier, value: snapshotId },
        { name: "businessId", type: sql.UniqueIdentifier, value: params.businessId },
        { name: "segmentId", type: sql.UniqueIdentifier, value: params.segmentId ?? null },
        { name: "name", type: sql.NVarChar(160), value: params.name },
        { name: "filterJson", type: sql.NVarChar(sql.MAX), value: params.filterJson },
        { name: "total", type: sql.Int, value: params.totalMatched },
        { name: "withPhone", type: sql.Int, value: params.withPhone },
        { name: "eligible", type: sql.Int, value: params.eligibleMarketing },
        { name: "withoutPerm", type: sql.Int, value: params.withoutPermission },
        { name: "userId", type: sql.UniqueIdentifier, value: params.createdByUserId },
      ],
    );
    for (const member of params.members) {
      await trx.query(
        `INSERT INTO dbo.TblCrmAudienceSnapshotMember (
           SnapshotID, CustomerID, BusinessID, PhoneNormalized, MarketingEligible, ExclusionReason
         ) VALUES (
           @snapshotId, @customerId, @businessId, @phone, @eligible, @reason
         )`,
        [
          { name: "snapshotId", type: sql.UniqueIdentifier, value: snapshotId },
          { name: "customerId", type: sql.UniqueIdentifier, value: member.customerId },
          { name: "businessId", type: sql.UniqueIdentifier, value: params.businessId },
          { name: "phone", type: sql.NVarChar(32), value: member.phoneNormalized },
          { name: "eligible", type: sql.Bit, value: member.marketingEligible ? 1 : 0 },
          { name: "reason", type: sql.NVarChar(64), value: member.exclusionReason },
        ],
      );
    }
  });
  return { snapshotId };
}

export async function listAudienceSnapshotMembers(params: {
  businessId: string;
  snapshotId: string;
}): Promise<
  Array<{
    customerId: string;
    phoneNormalized: string | null;
    marketingEligible: boolean;
    exclusionReason: string | null;
  }>
> {
  const result = await query<{
    CustomerID: string;
    PhoneNormalized: string | null;
    MarketingEligible: boolean;
    ExclusionReason: string | null;
  }>(
    `SELECT CustomerID, PhoneNormalized, MarketingEligible, ExclusionReason
     FROM dbo.TblCrmAudienceSnapshotMember
     WHERE BusinessID = @businessId AND SnapshotID = @snapshotId`,
    [
      { name: "businessId", type: sql.UniqueIdentifier, value: params.businessId },
      { name: "snapshotId", type: sql.UniqueIdentifier, value: params.snapshotId },
    ],
  );
  return result.recordset.map((row) => ({
    customerId: normalizeUuid(row.CustomerID),
    phoneNormalized: row.PhoneNormalized,
    marketingEligible: Boolean(row.MarketingEligible),
    exclusionReason: row.ExclusionReason,
  }));
}

export async function insertAudienceQueryAudit(params: {
  businessId: string;
  userId: string;
  naturalLanguage?: string | null;
  filterJson: string;
  compiledSqlHash?: string | null;
  rowCount?: number | null;
  durationMs?: number | null;
  status: "OK" | "REJECTED" | "ERROR" | "TIMEOUT";
  errorCode?: string | null;
}): Promise<void> {
  await query(
    `INSERT INTO dbo.TblCrmAudienceQueryAudit (
       AuditID, BusinessID, UserID, NaturalLanguage, FilterJson, CompiledSqlHash,
       MatchedRowCount, DurationMs, Status, ErrorCode
     ) VALUES (
       @id, @businessId, @userId, @nl, @filterJson, @hash,
       @rowCount, @durationMs, @status, @errorCode
     )`,
    [
      { name: "id", type: sql.UniqueIdentifier, value: randomUUID() },
      { name: "businessId", type: sql.UniqueIdentifier, value: params.businessId },
      { name: "userId", type: sql.UniqueIdentifier, value: params.userId },
      { name: "nl", type: sql.NVarChar(2000), value: params.naturalLanguage ?? null },
      { name: "filterJson", type: sql.NVarChar(sql.MAX), value: params.filterJson },
      { name: "hash", type: sql.NVarChar(128), value: params.compiledSqlHash ?? null },
      { name: "rowCount", type: sql.Int, value: params.rowCount ?? null },
      { name: "durationMs", type: sql.Int, value: params.durationMs ?? null },
      { name: "status", type: sql.NVarChar(32), value: params.status },
      { name: "errorCode", type: sql.NVarChar(128), value: params.errorCode ?? null },
    ],
  );
}

export type ErpSyncState = {
  syncStateId: string;
  businessId: string;
  integrationId: string;
  resource: string;
  cursorJson: string | null;
  status: "IDLE" | "RUNNING" | "SUCCESS" | "PARTIAL" | "ERROR";
  lastSuccessAtUtc: string | null;
  lastAttemptAtUtc: string | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  retryCount: number;
  updatedAtUtc: string;
};

export async function getErpSyncState(params: {
  businessId: string;
  resource: string;
}): Promise<ErpSyncState | null> {
  const result = await query<{
    SyncStateID: string;
    BusinessID: string;
    IntegrationID: string;
    Resource: string;
    CursorJson: string | null;
    Status: string;
    LastSuccessAtUtc: Date | null;
    LastAttemptAtUtc: Date | null;
    LastErrorCode: string | null;
    LastErrorMessage: string | null;
    RetryCount: number;
    UpdatedAtUtc: Date;
  }>(
    `SELECT SyncStateID, BusinessID, IntegrationID, Resource, CursorJson, Status,
            LastSuccessAtUtc, LastAttemptAtUtc, LastErrorCode, LastErrorMessage,
            RetryCount, UpdatedAtUtc
     FROM dbo.TblErpSyncState
     WHERE BusinessID = @businessId AND Resource = @resource`,
    [
      { name: "businessId", type: sql.UniqueIdentifier, value: params.businessId },
      { name: "resource", type: sql.NVarChar(64), value: params.resource },
    ],
  );
  const row = result.recordset[0];
  if (!row) return null;
  return {
    syncStateId: normalizeUuid(row.SyncStateID),
    businessId: normalizeUuid(row.BusinessID),
    integrationId: normalizeUuid(row.IntegrationID),
    resource: row.Resource,
    cursorJson: row.CursorJson,
    status: row.Status as ErpSyncState["status"],
    lastSuccessAtUtc: toIso(row.LastSuccessAtUtc),
    lastAttemptAtUtc: toIso(row.LastAttemptAtUtc),
    lastErrorCode: row.LastErrorCode,
    lastErrorMessage: row.LastErrorMessage,
    retryCount: row.RetryCount,
    updatedAtUtc: toIsoRequired(row.UpdatedAtUtc),
  };
}

export async function listErpSyncStates(params: {
  businessId: string;
}): Promise<ErpSyncState[]> {
  const result = await query<{
    SyncStateID: string;
    BusinessID: string;
    IntegrationID: string;
    Resource: string;
    CursorJson: string | null;
    Status: string;
    LastSuccessAtUtc: Date | null;
    LastAttemptAtUtc: Date | null;
    LastErrorCode: string | null;
    LastErrorMessage: string | null;
    RetryCount: number;
    UpdatedAtUtc: Date;
  }>(
    `SELECT SyncStateID, BusinessID, IntegrationID, Resource, CursorJson, Status,
            LastSuccessAtUtc, LastAttemptAtUtc, LastErrorCode, LastErrorMessage,
            RetryCount, UpdatedAtUtc
     FROM dbo.TblErpSyncState
     WHERE BusinessID = @businessId
     ORDER BY Resource`,
    [{ name: "businessId", type: sql.UniqueIdentifier, value: params.businessId }],
  );
  return result.recordset.map((row) => ({
    syncStateId: normalizeUuid(row.SyncStateID),
    businessId: normalizeUuid(row.BusinessID),
    integrationId: normalizeUuid(row.IntegrationID),
    resource: row.Resource,
    cursorJson: row.CursorJson,
    status: row.Status as ErpSyncState["status"],
    lastSuccessAtUtc: toIso(row.LastSuccessAtUtc),
    lastAttemptAtUtc: toIso(row.LastAttemptAtUtc),
    lastErrorCode: row.LastErrorCode,
    lastErrorMessage: row.LastErrorMessage,
    retryCount: row.RetryCount,
    updatedAtUtc: toIsoRequired(row.UpdatedAtUtc),
  }));
}

export async function upsertErpSyncState(params: {
  businessId: string;
  integrationId: string;
  resource: string;
  cursorJson?: string | null;
  status: ErpSyncState["status"];
  lastErrorCode?: string | null;
  lastErrorMessage?: string | null;
  markSuccess?: boolean;
  incrementRetry?: boolean;
}): Promise<void> {
  await query(
    `MERGE dbo.TblErpSyncState WITH (HOLDLOCK) AS target
     USING (SELECT @businessId AS BusinessID, @resource AS Resource) AS src
       ON target.BusinessID = src.BusinessID AND target.Resource = src.Resource
     WHEN MATCHED THEN
       UPDATE SET IntegrationID = @integrationId,
                  CursorJson = COALESCE(@cursorJson, target.CursorJson),
                  Status = @status,
                  LastAttemptAtUtc = SYSUTCDATETIME(),
                  LastSuccessAtUtc = CASE WHEN @markSuccess = 1 THEN SYSUTCDATETIME() ELSE target.LastSuccessAtUtc END,
                  LastErrorCode = @errorCode,
                  LastErrorMessage = @errorMessage,
                  RetryCount = CASE
                    WHEN @markSuccess = 1 THEN 0
                    WHEN @incrementRetry = 1 THEN target.RetryCount + 1
                    ELSE target.RetryCount
                  END,
                  UpdatedAtUtc = SYSUTCDATETIME()
     WHEN NOT MATCHED THEN
       INSERT (
         SyncStateID, BusinessID, IntegrationID, Resource, CursorJson, Status,
         LastAttemptAtUtc, LastSuccessAtUtc, LastErrorCode, LastErrorMessage, RetryCount
       ) VALUES (
         @id, @businessId, @integrationId, @resource, @cursorJson, @status,
         SYSUTCDATETIME(),
         CASE WHEN @markSuccess = 1 THEN SYSUTCDATETIME() ELSE NULL END,
         @errorCode, @errorMessage,
         CASE WHEN @incrementRetry = 1 THEN 1 ELSE 0 END
       );`,
    [
      { name: "id", type: sql.UniqueIdentifier, value: randomUUID() },
      { name: "businessId", type: sql.UniqueIdentifier, value: params.businessId },
      { name: "integrationId", type: sql.UniqueIdentifier, value: params.integrationId },
      { name: "resource", type: sql.NVarChar(64), value: params.resource },
      { name: "cursorJson", type: sql.NVarChar(sql.MAX), value: params.cursorJson ?? null },
      { name: "status", type: sql.NVarChar(32), value: params.status },
      { name: "errorCode", type: sql.NVarChar(128), value: params.lastErrorCode ?? null },
      {
        name: "errorMessage",
        type: sql.NVarChar(1000),
        value: params.lastErrorMessage ?? null,
      },
      { name: "markSuccess", type: sql.Bit, value: params.markSuccess ? 1 : 0 },
      { name: "incrementRetry", type: sql.Bit, value: params.incrementRetry ? 1 : 0 },
    ],
  );
}

export type ErpInvoiceUpsertInput = {
  externalInvId: string;
  externalClientId?: string | null;
  customerId?: string | null;
  invType?: string | null;
  invDate?: string | null;
  invTime?: string | null;
  branchId?: number | null;
  branchName?: string | null;
  grandTotal: number;
  subTotal?: number;
  discountValue?: number;
  isValidSale: boolean;
  isDeleted: boolean;
  rawStatus?: string | null;
  lines?: Array<{
    externalProId?: string | null;
    externalEmpId?: string | null;
    proType?: string | null;
    proName?: string | null;
    empName?: string | null;
    qty?: number;
    unitPrice?: number;
    lineTotal?: number;
  }>;
};

export async function upsertErpInvoiceMirror(params: {
  businessId: string;
  invoice: ErpInvoiceUpsertInput;
}): Promise<string> {
  const inv = params.invoice;
  const existing = await query<{ InvoiceMirrorID: string }>(
    `SELECT InvoiceMirrorID FROM dbo.TblErpInvoiceMirror
     WHERE BusinessID = @businessId AND ExternalInvId = @invId`,
    [
      { name: "businessId", type: sql.UniqueIdentifier, value: params.businessId },
      { name: "invId", type: sql.NVarChar(64), value: inv.externalInvId },
    ],
  );
  const invoiceMirrorId = existing.recordset[0]
    ? normalizeUuid(existing.recordset[0].InvoiceMirrorID)
    : randomUUID();

  await withTransaction(async (trx) => {
    await trx.query(
      `MERGE dbo.TblErpInvoiceMirror WITH (HOLDLOCK) AS target
       USING (SELECT @businessId AS BusinessID, @invId AS ExternalInvId) AS src
         ON target.BusinessID = src.BusinessID AND target.ExternalInvId = src.ExternalInvId
       WHEN MATCHED THEN
         UPDATE SET ExternalClientId = @clientId,
                    CustomerID = COALESCE(@customerId, target.CustomerID),
                    InvType = @invType,
                    InvDate = @invDate,
                    InvTime = @invTime,
                    BranchId = @branchId,
                    BranchName = @branchName,
                    GrandTotal = @grandTotal,
                    SubTotal = @subTotal,
                    DiscountValue = @discount,
                    IsValidSale = @isValid,
                    IsDeleted = @isDeleted,
                    RawStatus = @rawStatus,
                    SyncedAtUtc = SYSUTCDATETIME(),
                    UpdatedAtUtc = SYSUTCDATETIME()
       WHEN NOT MATCHED THEN
         INSERT (
           InvoiceMirrorID, BusinessID, ExternalInvId, ExternalClientId, CustomerID,
           InvType, InvDate, InvTime, BranchId, BranchName, GrandTotal, SubTotal,
           DiscountValue, IsValidSale, IsDeleted, RawStatus
         ) VALUES (
           @mirrorId, @businessId, @invId, @clientId, @customerId,
           @invType, @invDate, @invTime, @branchId, @branchName, @grandTotal, @subTotal,
           @discount, @isValid, @isDeleted, @rawStatus
         );`,
      [
        { name: "mirrorId", type: sql.UniqueIdentifier, value: invoiceMirrorId },
        { name: "businessId", type: sql.UniqueIdentifier, value: params.businessId },
        { name: "invId", type: sql.NVarChar(64), value: inv.externalInvId },
        { name: "clientId", type: sql.NVarChar(64), value: inv.externalClientId ?? null },
        { name: "customerId", type: sql.UniqueIdentifier, value: inv.customerId ?? null },
        { name: "invType", type: sql.NVarChar(64), value: inv.invType ?? null },
        { name: "invDate", type: sql.Date, value: inv.invDate ?? null },
        { name: "invTime", type: sql.NVarChar(32), value: inv.invTime ?? null },
        { name: "branchId", type: sql.Int, value: inv.branchId ?? null },
        { name: "branchName", type: sql.NVarChar(200), value: inv.branchName ?? null },
        { name: "grandTotal", type: sql.Decimal(18, 2), value: inv.grandTotal },
        { name: "subTotal", type: sql.Decimal(18, 2), value: inv.subTotal ?? inv.grandTotal },
        { name: "discount", type: sql.Decimal(18, 2), value: inv.discountValue ?? 0 },
        { name: "isValid", type: sql.Bit, value: inv.isValidSale ? 1 : 0 },
        { name: "isDeleted", type: sql.Bit, value: inv.isDeleted ? 1 : 0 },
        { name: "rawStatus", type: sql.NVarChar(64), value: inv.rawStatus ?? null },
      ],
    );

    if (inv.lines) {
      await trx.query(
        `DELETE FROM dbo.TblErpInvoiceLineMirror
         WHERE BusinessID = @businessId AND InvoiceMirrorID = @mirrorId`,
        [
          { name: "businessId", type: sql.UniqueIdentifier, value: params.businessId },
          { name: "mirrorId", type: sql.UniqueIdentifier, value: invoiceMirrorId },
        ],
      );
      for (const line of inv.lines) {
        await trx.query(
          `INSERT INTO dbo.TblErpInvoiceLineMirror (
             InvoiceLineMirrorID, BusinessID, InvoiceMirrorID, ExternalInvId,
             ExternalProId, ExternalEmpId, ProType, ProName, EmpName, Qty, UnitPrice, LineTotal
           ) VALUES (
             @lineId, @businessId, @mirrorId, @invId,
             @proId, @empId, @proType, @proName, @empName, @qty, @unitPrice, @lineTotal
           )`,
          [
            { name: "lineId", type: sql.UniqueIdentifier, value: randomUUID() },
            { name: "businessId", type: sql.UniqueIdentifier, value: params.businessId },
            { name: "mirrorId", type: sql.UniqueIdentifier, value: invoiceMirrorId },
            { name: "invId", type: sql.NVarChar(64), value: inv.externalInvId },
            { name: "proId", type: sql.NVarChar(64), value: line.externalProId ?? null },
            { name: "empId", type: sql.NVarChar(64), value: line.externalEmpId ?? null },
            { name: "proType", type: sql.NVarChar(32), value: line.proType ?? null },
            { name: "proName", type: sql.NVarChar(300), value: line.proName ?? null },
            { name: "empName", type: sql.NVarChar(200), value: line.empName ?? null },
            { name: "qty", type: sql.Decimal(18, 2), value: line.qty ?? 1 },
            { name: "unitPrice", type: sql.Decimal(18, 2), value: line.unitPrice ?? 0 },
            { name: "lineTotal", type: sql.Decimal(18, 2), value: line.lineTotal ?? 0 },
          ],
        );
      }
    }
  });

  return invoiceMirrorId;
}

export async function upsertErpServiceCatalog(params: {
  businessId: string;
  externalProId: string;
  proType?: string | null;
  proName: string;
  proNameAr?: string | null;
  categoryName?: string | null;
  isDeleted?: boolean;
}): Promise<void> {
  await query(
    `MERGE dbo.TblErpServiceCatalog WITH (HOLDLOCK) AS target
     USING (SELECT @businessId AS BusinessID, @proId AS ExternalProId) AS src
       ON target.BusinessID = src.BusinessID AND target.ExternalProId = src.ExternalProId
     WHEN MATCHED THEN
       UPDATE SET ProType = @proType, ProName = @proName, ProNameAr = @proNameAr,
                  CategoryName = @categoryName, IsDeleted = @isDeleted,
                  SyncedAtUtc = SYSUTCDATETIME()
     WHEN NOT MATCHED THEN
       INSERT (
         ServiceCatalogID, BusinessID, ExternalProId, ProType, ProName, ProNameAr,
         CategoryName, IsDeleted
       ) VALUES (
         @id, @businessId, @proId, @proType, @proName, @proNameAr, @categoryName, @isDeleted
       );`,
    [
      { name: "id", type: sql.UniqueIdentifier, value: randomUUID() },
      { name: "businessId", type: sql.UniqueIdentifier, value: params.businessId },
      { name: "proId", type: sql.NVarChar(64), value: params.externalProId },
      { name: "proType", type: sql.NVarChar(32), value: params.proType ?? null },
      { name: "proName", type: sql.NVarChar(300), value: params.proName },
      { name: "proNameAr", type: sql.NVarChar(300), value: params.proNameAr ?? null },
      { name: "categoryName", type: sql.NVarChar(200), value: params.categoryName ?? null },
      { name: "isDeleted", type: sql.Bit, value: params.isDeleted ? 1 : 0 },
    ],
  );
}

export async function listErpServiceCatalog(params: {
  businessId: string;
  limit?: number;
}): Promise<Array<{ externalProId: string; proName: string; proNameAr: string | null }>> {
  const limit = Math.min(500, Math.max(1, params.limit ?? 200));
  const result = await query<{
    ExternalProId: string;
    ProName: string;
    ProNameAr: string | null;
  }>(
    `SELECT TOP (@limit) ExternalProId, ProName, ProNameAr
     FROM dbo.TblErpServiceCatalog
     WHERE BusinessID = @businessId AND IsDeleted = 0
     ORDER BY ProName`,
    [
      { name: "businessId", type: sql.UniqueIdentifier, value: params.businessId },
      { name: "limit", type: sql.Int, value: limit },
    ],
  );
  return result.recordset.map((row) => ({
    externalProId: row.ExternalProId,
    proName: row.ProName,
    proNameAr: row.ProNameAr,
  }));
}

export async function getErpAggregatesForCustomer(params: {
  businessId: string;
  customerId: string;
}): Promise<CrmErpSummary> {
  const agg = await query<{
    TotalVisits: number;
    LastVisitAt: Date | null;
    TotalSpend: number;
    AverageInvoice: number;
  }>(
    `SELECT
       COUNT(1) AS TotalVisits,
       MAX(InvDate) AS LastVisitAt,
       ISNULL(SUM(GrandTotal), 0) AS TotalSpend,
       ISNULL(AVG(GrandTotal), 0) AS AverageInvoice
     FROM dbo.TblErpInvoiceMirror
     WHERE BusinessID = @businessId AND CustomerID = @customerId
       AND IsValidSale = 1 AND IsDeleted = 0`,
    [
      { name: "businessId", type: sql.UniqueIdentifier, value: params.businessId },
      { name: "customerId", type: sql.UniqueIdentifier, value: params.customerId },
    ],
  );
  const favoriteService = await query<{ ProName: string }>(
    `SELECT TOP 1 line.ProName
     FROM dbo.TblErpInvoiceLineMirror line
     INNER JOIN dbo.TblErpInvoiceMirror inv
       ON inv.InvoiceMirrorID = line.InvoiceMirrorID AND inv.BusinessID = line.BusinessID
     WHERE inv.BusinessID = @businessId AND inv.CustomerID = @customerId
       AND inv.IsValidSale = 1 AND inv.IsDeleted = 0
       AND line.ProName IS NOT NULL
       AND (line.ProType IS NULL OR line.ProType IN (N'serv', N'service'))
     GROUP BY line.ProName
     ORDER BY SUM(line.Qty) DESC, SUM(line.LineTotal) DESC`,
    [
      { name: "businessId", type: sql.UniqueIdentifier, value: params.businessId },
      { name: "customerId", type: sql.UniqueIdentifier, value: params.customerId },
    ],
  );
  const favoriteEmployee = await query<{ EmpName: string }>(
    `SELECT TOP 1 line.EmpName
     FROM dbo.TblErpInvoiceLineMirror line
     INNER JOIN dbo.TblErpInvoiceMirror inv
       ON inv.InvoiceMirrorID = line.InvoiceMirrorID AND inv.BusinessID = line.BusinessID
     WHERE inv.BusinessID = @businessId AND inv.CustomerID = @customerId
       AND inv.IsValidSale = 1 AND inv.IsDeleted = 0
       AND line.EmpName IS NOT NULL
     GROUP BY line.EmpName
     ORDER BY COUNT(1) DESC`,
    [
      { name: "businessId", type: sql.UniqueIdentifier, value: params.businessId },
      { name: "customerId", type: sql.UniqueIdentifier, value: params.customerId },
    ],
  );
  const branch = await query<{ BranchName: string }>(
    `SELECT TOP 1 BranchName
     FROM dbo.TblErpInvoiceMirror
     WHERE BusinessID = @businessId AND CustomerID = @customerId
       AND IsValidSale = 1 AND IsDeleted = 0 AND BranchName IS NOT NULL
     GROUP BY BranchName
     ORDER BY COUNT(1) DESC`,
    [
      { name: "businessId", type: sql.UniqueIdentifier, value: params.businessId },
      { name: "customerId", type: sql.UniqueIdentifier, value: params.customerId },
    ],
  );
  const row = agg.recordset[0];
  const totalSpend = Number(row?.TotalSpend ?? 0);
  return {
    connected: true,
    totalVisits: Number(row?.TotalVisits ?? 0),
    lastVisitAt: toDateOnly(row?.LastVisitAt ?? null),
    totalSpend,
    averageInvoice: Number(row?.AverageInvoice ?? 0),
    favoriteService: favoriteService.recordset[0]?.ProName ?? null,
    favoriteEmployee: favoriteEmployee.recordset[0]?.EmpName ?? null,
    mostVisitedBranch: branch.recordset[0]?.BranchName ?? null,
    lifetimeValue: totalSpend,
  };
}

export async function listErpInvoicesForCustomer(params: {
  businessId: string;
  customerId: string;
  limit?: number;
}): Promise<CrmErpInvoice[]> {
  const limit = Math.min(50, Math.max(1, params.limit ?? 20));
  const headers = await query<{
    InvoiceMirrorID: string;
    ExternalInvId: string;
    InvDate: Date | null;
    BranchName: string | null;
    GrandTotal: number;
  }>(
    `SELECT TOP (@limit) InvoiceMirrorID, ExternalInvId, InvDate, BranchName, GrandTotal
     FROM dbo.TblErpInvoiceMirror
     WHERE BusinessID = @businessId AND CustomerID = @customerId
       AND IsValidSale = 1 AND IsDeleted = 0
     ORDER BY InvDate DESC, UpdatedAtUtc DESC`,
    [
      { name: "businessId", type: sql.UniqueIdentifier, value: params.businessId },
      { name: "customerId", type: sql.UniqueIdentifier, value: params.customerId },
      { name: "limit", type: sql.Int, value: limit },
    ],
  );
  const invoices: CrmErpInvoice[] = [];
  for (const header of headers.recordset) {
    const lines = await query<{
      ProName: string | null;
      EmpName: string | null;
      Qty: number;
      LineTotal: number;
      ProType: string | null;
    }>(
      `SELECT ProName, EmpName, Qty, LineTotal, ProType
       FROM dbo.TblErpInvoiceLineMirror
       WHERE BusinessID = @businessId AND InvoiceMirrorID = @mirrorId
       ORDER BY ProName`,
      [
        { name: "businessId", type: sql.UniqueIdentifier, value: params.businessId },
        {
          name: "mirrorId",
          type: sql.UniqueIdentifier,
          value: normalizeUuid(header.InvoiceMirrorID),
        },
      ],
    );
    invoices.push({
      invoiceMirrorId: normalizeUuid(header.InvoiceMirrorID),
      externalInvId: header.ExternalInvId,
      invDate: toDateOnly(header.InvDate),
      branchName: header.BranchName,
      grandTotal: Number(header.GrandTotal),
      lines: lines.recordset.map((line) => ({
        proName: line.ProName,
        empName: line.EmpName,
        qty: Number(line.Qty),
        lineTotal: Number(line.LineTotal),
        proType: line.ProType,
      })),
    });
  }
  return invoices;
}

export async function listUnlinkedWhatsAppContacts(params: {
  businessId: string;
  limit: number;
}): Promise<
  Array<{
    contactId: string;
    displayName: string | null;
    phoneNormalized: string | null;
  }>
> {
  const result = await query<{
    ContactID: string;
    DisplayName: string | null;
    PhoneNormalized: string | null;
  }>(
    `SELECT TOP (@limit) ct.ContactID, ct.DisplayName, ct.PhoneNormalized
     FROM dbo.TblContact ct
     WHERE ct.BusinessID = @businessId
       AND ct.PhoneNormalized IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM dbo.TblCrmContactLink link
         WHERE link.BusinessID = ct.BusinessID AND link.ContactID = ct.ContactID
       )
     ORDER BY ct.UpdatedAtUtc DESC`,
    [
      { name: "businessId", type: sql.UniqueIdentifier, value: params.businessId },
      { name: "limit", type: sql.Int, value: params.limit },
    ],
  );
  return result.recordset.map((row) => ({
    contactId: normalizeUuid(row.ContactID),
    displayName: row.DisplayName,
    phoneNormalized: row.PhoneNormalized,
  }));
}

export async function getInboxPanelByConversationId(params: {
  businessId: string;
  conversationId: string;
}): Promise<{
  conversationId: string;
  contactId: string;
  customer: CrmCustomer | null;
  openFollowUps: CrmFollowUp[];
  latestNote: CrmNote | null;
  erp: Pick<CrmErpSummary, "totalVisits" | "lastVisitAt" | "totalSpend" | "favoriteService"> | null;
} | null> {
  const conv = await query<{ ContactID: string }>(
    `SELECT ContactID FROM dbo.TblConversation
     WHERE BusinessID = @businessId AND ConversationID = @conversationId`,
    [
      { name: "businessId", type: sql.UniqueIdentifier, value: params.businessId },
      {
        name: "conversationId",
        type: sql.UniqueIdentifier,
        value: params.conversationId,
      },
    ],
  );
  const contactId = conv.recordset[0]?.ContactID;
  if (!contactId) return null;

  let customerId = await getCustomerIdByContactId({
    businessId: params.businessId,
    contactId: normalizeUuid(contactId),
  });
  if (!customerId) {
    const contact = await query<{ PhoneNormalized: string | null; DisplayName: string | null }>(
      `SELECT PhoneNormalized, DisplayName FROM dbo.TblContact
       WHERE BusinessID = @businessId AND ContactID = @contactId`,
      [
        { name: "businessId", type: sql.UniqueIdentifier, value: params.businessId },
        { name: "contactId", type: sql.UniqueIdentifier, value: contactId },
      ],
    );
    const phone = contact.recordset[0]?.PhoneNormalized;
    if (phone) {
      const byPhone = await getCustomerByPhone({
        businessId: params.businessId,
        phoneNormalized: phone,
      });
      customerId = byPhone?.customerId ?? null;
    }
  }

  const customer = customerId
    ? await getCustomerById({ businessId: params.businessId, customerId })
    : null;
  const openFollowUps = customer
    ? (
        await listFollowUps({
          businessId: params.businessId,
          customerId: customer.customerId,
          status: "OPEN",
          pageSize: 5,
        })
      ).items
    : [];
  const notes = customer
    ? await listNotes({ businessId: params.businessId, customerId: customer.customerId })
    : [];
  const erp = customer
    ? await getErpAggregatesForCustomer({
        businessId: params.businessId,
        customerId: customer.customerId,
      })
    : null;

  return {
    conversationId: normalizeUuid(params.conversationId),
    contactId: normalizeUuid(contactId),
    customer,
    openFollowUps,
    latestNote: notes[0] ?? null,
    erp: erp
      ? {
          totalVisits: erp.totalVisits,
          lastVisitAt: erp.lastVisitAt,
          totalSpend: erp.totalSpend,
          favoriteService: erp.favoriteService,
        }
      : null,
  };
}

export type AudienceMatchRow = {
  CustomerID: string;
  FullName: string;
  PrimaryPhoneNormalized: string | null;
  TotalSpend: number | null;
  LastVisitAt: Date | string | null;
};

export async function getActiveWhatsAppChannelId(params: {
  businessId: string;
}): Promise<string | null> {
  const result = await query<{ ChannelConnectionID: string }>(
    `SELECT TOP (2) ChannelConnectionID
     FROM dbo.TblChannelConnection
     WHERE BusinessID = @businessId
       AND Channel = N'WHATSAPP'
       AND IsActive = 1
       AND Status = N'ACTIVE'
     ORDER BY CreatedAtUtc DESC`,
    [{ name: "businessId", type: sql.UniqueIdentifier, value: params.businessId }],
  );
  if (result.recordset.length !== 1) return null;
  return normalizeUuid(result.recordset[0].ChannelConnectionID);
}

export async function enrichAudienceMarketingEligibility(params: {
  businessId: string;
  rows: AudienceMatchRow[];
  /** Required: permission/opt-out are always scoped to this WhatsApp channel. */
  channelConnectionId: string;
}): Promise<CrmAudiencePreview["customers"]> {
  if (!params.channelConnectionId) {
    throw new Error("channelConnectionId is required for marketing eligibility");
  }
  if (!params.rows.length) return [];
  const phones = [
    ...new Set(
      params.rows
        .map((r) => r.PrimaryPhoneNormalized)
        .filter((p): p is string => Boolean(p)),
    ),
  ];
  const permitted = new Set<string>();
  const optedOut = new Set<string>();
  if (phones.length) {
    const inputs: QueryInput[] = [
      { name: "businessId", type: sql.UniqueIdentifier, value: params.businessId },
      {
        name: "channelId",
        type: sql.UniqueIdentifier,
        value: params.channelConnectionId,
      },
    ];
    const placeholders: string[] = [];
    phones.forEach((phone, i) => {
      const name = `ph${i}`;
      placeholders.push(`@${name}`);
      inputs.push({ name, type: sql.NVarChar(32), value: phone });
    });
    // Never fall back to cross-channel permission checks.
    const perm = await query<{ PhoneNormalized: string }>(
      `SELECT DISTINCT PhoneNormalized FROM dbo.TblWhatsAppCampaignPermission
       WHERE BusinessID = @businessId
         AND ChannelConnectionID = @channelId
         AND PhoneNormalized IN (${placeholders.join(", ")})`,
      inputs,
    );
    for (const row of perm.recordset) permitted.add(row.PhoneNormalized);
    const out = await query<{ PhoneNormalized: string }>(
      `SELECT DISTINCT PhoneNormalized FROM dbo.TblWhatsAppCampaignOptOut
       WHERE BusinessID = @businessId
         AND ChannelConnectionID = @channelId
         AND PhoneNormalized IN (${placeholders.join(", ")})`,
      inputs,
    );
    for (const row of out.recordset) optedOut.add(row.PhoneNormalized);
  }

  return params.rows.map((row) => {
    const phone = row.PrimaryPhoneNormalized;
    let marketingEligible = false;
    let exclusionReason: string | null = null;
    if (!phone) {
      exclusionReason = "NO_PHONE";
    } else if (optedOut.has(phone)) {
      exclusionReason = "OPTED_OUT";
    } else if (!permitted.has(phone)) {
      exclusionReason = "NO_PERMISSION";
    } else {
      marketingEligible = true;
    }
    return {
      customerId: normalizeUuid(row.CustomerID),
      fullName: row.FullName,
      primaryPhoneNormalized: phone,
      marketingEligible,
      exclusionReason,
      totalSpend: row.TotalSpend == null ? null : Number(row.TotalSpend),
      lastVisitAt: toDateOnly(row.LastVisitAt),
    };
  });
}

/** Aggregate CRM/ERP mirror diagnostics only; no customer PII and no source writes. */
export async function getCrmErpMirrorCounts(params: { businessId: string }) {
  const result = await query<{
    ErpCustomers: number;
    ValidInvoices: number;
    UnlinkedInvoices: number;
    InvoiceLines: number;
    CatalogServices: number;
  }>(
    `SELECT
      (SELECT COUNT_BIG(1) FROM dbo.TblCrmCustomer
        WHERE BusinessID = @businessId AND ExternalErpClientId IS NOT NULL AND Status <> N'MERGED') AS ErpCustomers,
      (SELECT COUNT_BIG(1) FROM dbo.TblErpInvoiceMirror
        WHERE BusinessID = @businessId AND IsValidSale = 1 AND IsDeleted = 0) AS ValidInvoices,
      (SELECT COUNT_BIG(1) FROM dbo.TblErpInvoiceMirror
        WHERE BusinessID = @businessId AND IsValidSale = 1 AND IsDeleted = 0 AND CustomerID IS NULL) AS UnlinkedInvoices,
      (SELECT COUNT_BIG(1) FROM dbo.TblErpInvoiceLineMirror
        WHERE BusinessID = @businessId) AS InvoiceLines,
      (SELECT COUNT_BIG(1) FROM dbo.TblErpServiceCatalog
        WHERE BusinessID = @businessId AND IsDeleted = 0) AS CatalogServices`,
    [{ name: "businessId", type: sql.UniqueIdentifier, value: params.businessId }],
  );
  const row = result.recordset[0];
  return {
    erpCustomers: Number(row?.ErpCustomers ?? 0),
    validInvoices: Number(row?.ValidInvoices ?? 0),
    unlinkedInvoices: Number(row?.UnlinkedInvoices ?? 0),
    invoiceLines: Number(row?.InvoiceLines ?? 0),
    catalogServices: Number(row?.CatalogServices ?? 0),
  };
}
