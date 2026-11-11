import { getPool, type QueryInput } from "@/lib/db";
import { ValidationError } from "@/lib/tenancy/errors";

import {
  explainAudienceFilterAr,
  parseAudienceFilterAst,
} from "./audience-ast";
import {
  AUDIENCE_QUERY_TIMEOUT_MS,
  compileAudienceFilter,
} from "./audience-compiler";
import * as repo from "./repository";
import { requireCrmWriteAccess } from "./service";
import type { AudienceFilterAst, CrmAudiencePreview, CrmSegment } from "./types";

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
  const e = error as { code?: string; message?: string; name?: string };
  if (e.code === "ETIMEOUT") return true;
  return /timeout|timed out/i.test(e.message ?? "");
}

export async function previewAudience(params: {
  businessId: string;
  userId: string;
  filter: unknown;
  naturalLanguage?: string | null;
  previewLimit?: number;
}): Promise<CrmAudiencePreview> {
  await requireCrmWriteAccess(params);
  const started = Date.now();
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
      durationMs: Date.now() - started,
    });
    throw new ValidationError("فلتر الجمهور غير صالح");
  }

  const compiled = compileAudienceFilter({
    businessId: params.businessId,
    filter: {
      ...filter,
      limit: Math.min(
        params.previewLimit ?? filter.limit ?? 100,
        200,
      ),
    },
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

    const customers = await repo.enrichAudienceMarketingEligibility({
      businessId: params.businessId,
      rows,
    });

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
    const duplicatesRemoved = Math.max(0, withPhone - uniquePhones.size);
    const totalMatched = Number(countRows[0]?.TotalCount ?? customers.length);

    await repo.insertAudienceQueryAudit({
      businessId: params.businessId,
      userId: params.userId,
      naturalLanguage: params.naturalLanguage,
      filterJson: JSON.stringify(filter),
      compiledSqlHash: compiled.sqlHash,
      rowCount: totalMatched,
      durationMs: Date.now() - started,
      status: "OK",
    });

    return {
      name: filter.name ?? "معاينة الجمهور",
      filter,
      explanationAr: explainAudienceFilterAr(filter),
      totalMatched,
      withPhone,
      eligibleMarketing,
      withoutPermission,
      duplicatesRemoved,
      customers,
    };
  } catch (error) {
    const timedOut = isTimeoutError(error);
    await repo.insertAudienceQueryAudit({
      businessId: params.businessId,
      userId: params.userId,
      naturalLanguage: params.naturalLanguage,
      filterJson: JSON.stringify(filter),
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

export async function freezeAudienceSnapshot(params: {
  businessId: string;
  userId: string;
  filter: unknown;
  name?: string | null;
  segmentId?: string | null;
  naturalLanguage?: string | null;
}): Promise<{ snapshotId: string; preview: CrmAudiencePreview }> {
  const preview = await previewAudience({
    businessId: params.businessId,
    userId: params.userId,
    filter: params.filter,
    naturalLanguage: params.naturalLanguage,
    previewLimit: 2000,
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
