import { randomUUID } from "node:crypto";

import type { BusinessRole } from "@/constants/roles";
import { BUSINESS_ROLES } from "@/constants/roles";
import { query, sql, type TransactionClient } from "@/lib/db";
import type {
  Business,
  BusinessMember,
  BusinessStatus,
  MemberStatus,
} from "@/types/domain";

type BusinessRow = {
  BusinessID: string;
  Name: string;
  Slug: string;
  Category: string;
  CountryCode: string;
  Locale: string;
  Timezone: string;
  Status: string;
  OnboardingCompletedAtUtc: Date | null;
  CreatedAtUtc: Date;
  UpdatedAtUtc: Date;
};

type MemberRow = {
  BusinessMemberID: string;
  BusinessID: string;
  UserID: string;
  Role: string;
  Status: string;
  CreatedAtUtc: Date;
};

type Db = Pick<TransactionClient, "query">;

const poolDb: Db = { query };

export function mapBusiness(row: BusinessRow): Business {
  return {
    businessId: row.BusinessID,
    name: row.Name,
    slug: row.Slug,
    category: row.Category,
    countryCode: row.CountryCode,
    locale: row.Locale,
    timezone: row.Timezone,
    status: row.Status as BusinessStatus,
    onboardingCompletedAtUtc: row.OnboardingCompletedAtUtc,
    createdAtUtc: row.CreatedAtUtc,
    updatedAtUtc: row.UpdatedAtUtc,
  };
}

export function mapMember(row: MemberRow): BusinessMember {
  return {
    businessMemberId: row.BusinessMemberID,
    businessId: row.BusinessID,
    userId: row.UserID,
    role: row.Role as BusinessRole,
    status: row.Status as MemberStatus,
    createdAtUtc: row.CreatedAtUtc,
  };
}

export async function findBusinessBySlug(
  slug: string,
  db: Db = poolDb,
): Promise<Business | null> {
  const result = await db.query<BusinessRow>(
    `SELECT BusinessID, Name, Slug, Category, CountryCode, Locale, Timezone,
            Status, OnboardingCompletedAtUtc, CreatedAtUtc, UpdatedAtUtc
     FROM TblBusiness
     WHERE Slug = @slug`,
    [{ name: "slug", type: sql.NVarChar(100), value: slug }],
  );
  const row = result.recordset[0];
  return row ? mapBusiness(row) : null;
}

export async function getBusinessById(params: {
  businessId: string;
}): Promise<Business | null> {
  const result = await query<BusinessRow>(
    `SELECT BusinessID, Name, Slug, Category, CountryCode, Locale, Timezone,
            Status, OnboardingCompletedAtUtc, CreatedAtUtc, UpdatedAtUtc
     FROM TblBusiness
     WHERE BusinessID = @businessId`,
    [
      {
        name: "businessId",
        type: sql.UniqueIdentifier,
        value: params.businessId,
      },
    ],
  );
  const row = result.recordset[0];
  return row ? mapBusiness(row) : null;
}

export async function listBusinessesForUser(
  userId: string,
): Promise<Business[]> {
  const result = await query<BusinessRow>(
    `SELECT b.BusinessID, b.Name, b.Slug, b.Category, b.CountryCode, b.Locale, b.Timezone,
            b.Status, b.OnboardingCompletedAtUtc, b.CreatedAtUtc, b.UpdatedAtUtc
     FROM TblBusiness b
     INNER JOIN TblBusinessMember m
       ON m.BusinessID = b.BusinessID
     WHERE m.UserID = @userId AND m.Status = N'ACTIVE'
     ORDER BY b.Name`,
    [{ name: "userId", type: sql.UniqueIdentifier, value: userId }],
  );
  return result.recordset.map(mapBusiness);
}

export async function insertBusiness(
  params: {
    businessId: string;
    name: string;
    slug: string;
    category: string;
    countryCode: string;
    locale: string;
    timezone: string;
    status?: BusinessStatus;
  },
  db: Db = poolDb,
): Promise<Business> {
  const now = new Date();
  const status = params.status ?? "ACTIVE";

  await db.query(
    `INSERT INTO TblBusiness (
      BusinessID, Name, Slug, Category, CountryCode, Locale, Timezone,
      Status, OnboardingCompletedAtUtc, CreatedAtUtc, UpdatedAtUtc
    ) VALUES (
      @businessId, @name, @slug, @category, @countryCode, @locale, @timezone,
      @status, NULL, @createdAtUtc, @updatedAtUtc
    )`,
    [
      {
        name: "businessId",
        type: sql.UniqueIdentifier,
        value: params.businessId,
      },
      { name: "name", type: sql.NVarChar(200), value: params.name },
      { name: "slug", type: sql.NVarChar(100), value: params.slug },
      { name: "category", type: sql.NVarChar(100), value: params.category },
      {
        name: "countryCode",
        type: sql.NVarChar(2),
        value: params.countryCode,
      },
      { name: "locale", type: sql.NVarChar(20), value: params.locale },
      { name: "timezone", type: sql.NVarChar(64), value: params.timezone },
      { name: "status", type: sql.NVarChar(32), value: status },
      { name: "createdAtUtc", type: sql.DateTime2, value: now },
      { name: "updatedAtUtc", type: sql.DateTime2, value: now },
    ],
  );

  return {
    businessId: params.businessId,
    name: params.name,
    slug: params.slug,
    category: params.category,
    countryCode: params.countryCode,
    locale: params.locale,
    timezone: params.timezone,
    status,
    onboardingCompletedAtUtc: null,
    createdAtUtc: now,
    updatedAtUtc: now,
  };
}

export async function insertBusinessMember(
  params: {
    businessId: string;
    userId: string;
    role: BusinessRole;
    status?: MemberStatus;
  },
  db: Db = poolDb,
): Promise<BusinessMember> {
  const businessMemberId = randomUUID();
  const now = new Date();
  const status = params.status ?? "ACTIVE";

  await db.query(
    `INSERT INTO TblBusinessMember (
      BusinessMemberID, BusinessID, UserID, Role, Status, CreatedAtUtc
    ) VALUES (
      @businessMemberId, @businessId, @userId, @role, @status, @createdAtUtc
    )`,
    [
      {
        name: "businessMemberId",
        type: sql.UniqueIdentifier,
        value: businessMemberId,
      },
      {
        name: "businessId",
        type: sql.UniqueIdentifier,
        value: params.businessId,
      },
      { name: "userId", type: sql.UniqueIdentifier, value: params.userId },
      { name: "role", type: sql.NVarChar(32), value: params.role },
      { name: "status", type: sql.NVarChar(32), value: status },
      { name: "createdAtUtc", type: sql.DateTime2, value: now },
    ],
  );

  return {
    businessMemberId,
    businessId: params.businessId,
    userId: params.userId,
    role: params.role,
    status,
    createdAtUtc: now,
  };
}

export async function getMembership(params: {
  userId: string;
  businessId: string;
}): Promise<BusinessMember | null> {
  const result = await query<MemberRow>(
    `SELECT BusinessMemberID, BusinessID, UserID, Role, Status, CreatedAtUtc
     FROM TblBusinessMember
     WHERE UserID = @userId AND BusinessID = @businessId`,
    [
      { name: "userId", type: sql.UniqueIdentifier, value: params.userId },
      {
        name: "businessId",
        type: sql.UniqueIdentifier,
        value: params.businessId,
      },
    ],
  );
  const row = result.recordset[0];
  return row ? mapMember(row) : null;
}

export async function updateBusinessRecord(params: {
  businessId: string;
  name?: string;
  category?: string;
  countryCode?: string;
  locale?: string;
  timezone?: string;
  status?: BusinessStatus;
  onboardingCompletedAtUtc?: Date | null;
}): Promise<Business | null> {
  const existing = await getBusinessById({ businessId: params.businessId });
  if (!existing) {
    return null;
  }

  const next = {
    name: params.name ?? existing.name,
    category: params.category ?? existing.category,
    countryCode: params.countryCode ?? existing.countryCode,
    locale: params.locale ?? existing.locale,
    timezone: params.timezone ?? existing.timezone,
    status: params.status ?? existing.status,
    onboardingCompletedAtUtc:
      params.onboardingCompletedAtUtc === undefined
        ? existing.onboardingCompletedAtUtc
        : params.onboardingCompletedAtUtc,
  };
  const now = new Date();

  await query(
    `UPDATE TblBusiness
     SET Name = @name,
         Category = @category,
         CountryCode = @countryCode,
         Locale = @locale,
         Timezone = @timezone,
         Status = @status,
         OnboardingCompletedAtUtc = @onboardingCompletedAtUtc,
         UpdatedAtUtc = @updatedAtUtc
     WHERE BusinessID = @businessId`,
    [
      {
        name: "businessId",
        type: sql.UniqueIdentifier,
        value: params.businessId,
      },
      { name: "name", type: sql.NVarChar(200), value: next.name },
      { name: "category", type: sql.NVarChar(100), value: next.category },
      {
        name: "countryCode",
        type: sql.NVarChar(2),
        value: next.countryCode,
      },
      { name: "locale", type: sql.NVarChar(20), value: next.locale },
      { name: "timezone", type: sql.NVarChar(64), value: next.timezone },
      { name: "status", type: sql.NVarChar(32), value: next.status },
      {
        name: "onboardingCompletedAtUtc",
        type: sql.DateTime2,
        value: next.onboardingCompletedAtUtc,
      },
      { name: "updatedAtUtc", type: sql.DateTime2, value: now },
    ],
  );

  return {
    ...existing,
    ...next,
    updatedAtUtc: now,
  };
}

export { BUSINESS_ROLES };
