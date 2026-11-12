import { getPool, type QueryInput } from "@/lib/db";
import { ValidationError } from "@/lib/tenancy/errors";

import {
  explainAudienceFilterAr,
  parseAudienceFilterAst,
} from "./audience-ast";
import {
  AUDIENCE_MAX_ROWS,
  AUDIENCE_QUERY_TIMEOUT_MS,
  compileAudienceFilter,
} from "./audience-compiler";
import * as repo from "./repository";
import { requireCrmWriteAccess } from "./service";
import type { AudienceFilterAst, CrmAudiencePreview, CrmSegment } from "./types";

/** UI preview page size — not used for snapshot materialization. */
export const AUDIENCE_PREVIEW_PAGE_SIZE = 100;
export const AUDIENCE_SNAPSHOT_MAX_ROWS = AUDIENCE_MAX_ROWS;

async function queryWithTimeout<T extends Record<string, unknown>>(
  text: string,
  inputs: QueryInput[],
  timeoutMs: number,
): Promise<T[]> {
  const pool = await getPool();
  const request = pool.request();
  (request as { timeout?: number }).timeout = timeoutMs;
  for (const input of inputs) {
    request.input(input.name, input.type as never, input.value);
  }
  const result = await Promise.race([
    request.query<T>(text),
    new Promise<never>((_, reject) => {
      const err = new Error("Audience query timed out");
      (err as { code?: string }).code = "ETIMEOUT";
      setTimeout(() => reject(err), timeoutMs);
    }),
  ]);
  return result.recordset;
}

function isTimeoutError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { code?: string; message?: string };
  if (e.code === "ETIMEOUT") return true;
  return /timeout|timed out/i.test(e.message ?? "");
}

function summarizeCustomers(
  customers: CrmAudiencePreview["customers"],
): Pick<
  CrmAudiencePreview,
  "withPhone" | "eligibleMarketing" | "withoutPermission" | "duplicatesRemoved"
> {
  const withPhone = customers.filter((c) => c.primaryPhoneNormalized).length;
  const eligibleMarketing = customers.filter((c) => c.marketingEligible).length;
  const withoutPermission = customers.filter(
    (c) => c.exclusionReason === "NO_PERMISSION" || c.exclusionReason === "OPTED_OUT",
  ).length;
  const uniquePhones = new Set(
    customers
      .map((c) => c.primaryPhoneNormalized)
      .filter((p): p is string => Boolean(p)),
  );
  return {
    withPhone,
    eligibleMarketing,
    withoutPermission,
    duplicatesRemoved: Math.max(0, withPhone - uniquePhones.size),
  };
}

async function resolveAudienceChannelId(businessId: string): Promise<string | null> {
  return repo.getActiveWhatsAppChannelId({ businessId });
}

async function runAudienceQuery(params: {
  businessId: string;
  userId: string;
  filter: AudienceFilterAst;
  rowLimit: number;
  naturalLanguage?: string | null;
  channelConnectionId?: string | null;
}): Promise<{
  filter: AudienceFilterAst;
  totalMatched: number;
  customers: CrmAudiencePreview["customers"];
  truncated: boolean;
  audienceCap: number;
}> {
  const started = Date.now();
  const rowLimit = Math.min(Math.max(1, params.rowLimit), AUDIENCE_SNAPSHOT_MAX_ROWS);
  const compiled = compileAudienceFilter({
    businessId: params.businessId,
    filter: { ...params.filter, limit: rowLimit },
  });

  try {
    const [rows, countRows] = await Promise.all([
      queryWithTimeout<{
        CustomerID: string;
        FullName: string;
        PrimaryPhoneNormalized: string | null;
        TotalSpend: number | null;
        LastVisitAt: Date | string | null;
      }>(compiled.sqlText, compiled.inputs, AUDIENCE_QUERY_TIMEOUT_MS),
      queryWithTimeout<{ TotalCount: number }>(
        compiled.countSqlText,
        compiled.inputs.filter((i) => i.name !== "limit"),
        AUDIENCE_QUERY_TIMEOUT_MS,
      ),
    ]);

    const totalMatched = Number(countRows[0]?.TotalCount ?? rows.length);
    const customers = await repo.enrichAudienceMarketingEligibility({
      businessId: params.businessId,
      channelConnectionId: params.channelConnectionId ?? null,
      rows,
    });

    await repo.insertAudienceQueryAudit({
      businessId: params.businessId,
      userId: params.userId,
      naturalLanguage: params.naturalLanguage,
      filterJson: JSON.stringify(params.filter),
      compiledSqlHash: compiled.sqlHash,
      rowCount: totalMatched,
      durationMs: Date.now() - started,
      status: "OK",
    });

    return {
      filter: params.filter,
      totalMatched,
      customers,
      truncated: totalMatched > rowLimit,
      audienceCap: AUDIENCE_SNAPSHOT_MAX_ROWS,
    };
  } catch (error) {
    const timedOut = isTimeoutError(error);
    await repo.insertAudienceQueryAudit({
      businessId: params.businessId,
      userId: params.userId,
      naturalLanguage: params.naturalLanguage,
      filterJson: JSON.stringify(params.filter),
      compiledSqlHash: compiled.sqlHash,
      durationMs: Date.now() - started,
      status: timedOut ? "TIMEOUT" : "ERROR",
      errorCode: timedOut ? "AUDIENCE_TIMEOUT" : "AUDIENCE_QUERY_FAILED",
    });
    if (timedOut) {
      throw new ValidationError("انتهت مهلة استعلام الجمهور — بسّط الشروط ثم أعد المحاولة");
    }
    throw error;
  }
}

export async function previewAudience(params: {
  businessId: string;
  userId: string;
  filter: unknown;
  naturalLanguage?: string | null;
  previewLimit?: number;
  channelConnectionId?: string | null;
}): Promise<CrmAudiencePreview & { truncated: boolean; audienceCap: number; previewLimit: number }> {
  await requireCrmWriteAccess(params);
  let filter: AudienceFilterAst;
  try {
    filter = parseAudienceFilterAst(params.filter);
  } catch {
    await repo.insertAudienceQueryAudit({
      businessId: params.businessId,
      userId: params.userId,
      naturalLanguage: params.naturalLanguage,
      filterJson: JSON.stringify(params.filter ?? {}),
      status: "REJECTED",
      errorCode: "INVALID_FILTER",
    });
    throw new ValidationError("فلتر الجمهور غير صالح");
  }

  const previewLimit = Math.min(
    params.previewLimit ?? AUDIENCE_PREVIEW_PAGE_SIZE,
    AUDIENCE_PREVIEW_PAGE_SIZE,
  );
  const channelConnectionId =
    params.channelConnectionId
    ?? await resolveAudienceChannelId(params.businessId);

  const result = await runAudienceQuery({
    businessId: params.businessId,
    userId: params.userId,
    filter,
    rowLimit: previewLimit,
    naturalLanguage: params.naturalLanguage,
    channelConnectionId,
  });

  // Preview counts for eligibility are page-scoped; totalMatched is the full set.
  const pageStats = summarizeCustomers(result.customers);

  return {
    name: filter.name ?? "معاينة الجمهور",
    filter,
    explanationAr: explainAudienceFilterAr(filter),
    totalMatched: result.totalMatched,
    ...pageStats,
    customers: result.customers,
    truncated: result.totalMatched > previewLimit,
    audienceCap: AUDIENCE_SNAPSHOT_MAX_ROWS,
    previewLimit,
  };
}

/**
 * Materializes the complete audience up to AUDIENCE_SNAPSHOT_MAX_ROWS.
 * Throws if the matched set exceeds the hard cap (never silently truncate a snapshot).
 */
export async function materializeAudience(params: {
  businessId: string;
  userId: string;
  filter: unknown;
  naturalLanguage?: string | null;
  channelConnectionId?: string | null;
}): Promise<CrmAudiencePreview & { truncated: false; audienceCap: number }> {
  await requireCrmWriteAccess(params);
  const filter = parseAudienceFilterAst(params.filter);
  const channelConnectionId =
    params.channelConnectionId
    ?? await resolveAudienceChannelId(params.businessId);

  const result = await runAudienceQuery({
    businessId: params.businessId,
    userId: params.userId,
    filter,
    rowLimit: AUDIENCE_SNAPSHOT_MAX_ROWS,
    naturalLanguage: params.naturalLanguage,
    channelConnectionId,
  });

  if (result.totalMatched > AUDIENCE_SNAPSHOT_MAX_ROWS) {
    throw new ValidationError(
      `الجمهور أكبر من الحد الأقصى (${AUDIENCE_SNAPSHOT_MAX_ROWS}). أضف فلاتر لتضييق النتائج قبل التثبيت.`,
    );
  }

  const stats = summarizeCustomers(result.customers);
  return {
    name: filter.name ?? "جمهور الحملة",
    filter,
    explanationAr: explainAudienceFilterAr(filter),
    totalMatched: result.totalMatched,
    ...stats,
    customers: result.customers,
    truncated: false,
    audienceCap: AUDIENCE_SNAPSHOT_MAX_ROWS,
  };
}

export async function freezeAudienceSnapshot(params: {
  businessId: string;
  userId: string;
  filter: unknown;
  name?: string | null;
  segmentId?: string | null;
  naturalLanguage?: string | null;
  channelConnectionId?: string | null;
}): Promise<{ snapshotId: string; preview: CrmAudiencePreview }> {
  const preview = await materializeAudience({
    businessId: params.businessId,
    userId: params.userId,
    filter: params.filter,
    naturalLanguage: params.naturalLanguage,
    channelConnectionId: params.channelConnectionId,
  });

  const { snapshotId } = await repo.createAudienceSnapshot({
    businessId: params.businessId,
    name: params.name?.trim() || preview.name,
    filterJson: JSON.stringify(preview.filter),
    segmentId: params.segmentId ?? null,
    createdByUserId: params.userId,
    totalMatched: preview.totalMatched,
    withPhone: preview.withPhone,
    eligibleMarketing: preview.eligibleMarketing,
    withoutPermission: preview.withoutPermission,
    members: preview.customers.map((c) => ({
      customerId: c.customerId,
      phoneNormalized: c.primaryPhoneNormalized,
      marketingEligible: c.marketingEligible,
      exclusionReason: c.exclusionReason,
    })),
  });

  return { snapshotId, preview };
}

/** Re-check permission/opt-out for an already frozen snapshot against the active channel. */
export async function revalidateSnapshotEligibility(params: {
  businessId: string;
  snapshotId: string;
  channelConnectionId?: string | null;
}): Promise<{
  eligiblePhones: string[];
  members: Array<{
    customerId: string;
    phoneNormalized: string | null;
    marketingEligible: boolean;
    exclusionReason: string | null;
  }>;
  eligibleMarketing: number;
  withoutPermission: number;
}> {
  const channelConnectionId =
    params.channelConnectionId
    ?? await resolveAudienceChannelId(params.businessId);
  const members = await repo.listAudienceSnapshotMembers({
    businessId: params.businessId,
    snapshotId: params.snapshotId,
  });
  const rows = members.map((m) => ({
    CustomerID: m.customerId,
    FullName: "",
    PrimaryPhoneNormalized: m.phoneNormalized,
    TotalSpend: null,
    LastVisitAt: null,
  }));
  const enriched = await repo.enrichAudienceMarketingEligibility({
    businessId: params.businessId,
    channelConnectionId,
    rows,
  });
  const eligiblePhones = [
    ...new Set(
      enriched
        .filter((c) => c.marketingEligible && c.primaryPhoneNormalized)
        .map((c) => c.primaryPhoneNormalized!),
    ),
  ];
  return {
    eligiblePhones,
    members: enriched.map((c) => ({
      customerId: c.customerId,
      phoneNormalized: c.primaryPhoneNormalized,
      marketingEligible: c.marketingEligible,
      exclusionReason: c.exclusionReason,
    })),
    eligibleMarketing: eligiblePhones.length,
    withoutPermission: enriched.filter(
      (c) => c.exclusionReason === "NO_PERMISSION" || c.exclusionReason === "OPTED_OUT",
    ).length,
  };
}

export async function saveSegment(params: {
  businessId: string;
  userId: string;
  segmentId?: string | null;
  name: string;
  description?: string | null;
  filter: unknown;
}): Promise<CrmSegment> {
  await requireCrmWriteAccess(params);
  const filter = parseAudienceFilterAst(params.filter);
  return repo.upsertSegment({
    businessId: params.businessId,
    segmentId: params.segmentId,
    name: params.name,
    description: params.description,
    filterJson: JSON.stringify(filter),
    explanationAr: explainAudienceFilterAr(filter),
    createdByUserId: params.userId,
  });
}

export async function listSegments(params: {
  businessId: string;
  userId: string;
}): Promise<CrmSegment[]> {
  await requireCrmWriteAccess(params);
  return repo.listSegments({ businessId: params.businessId });
}
