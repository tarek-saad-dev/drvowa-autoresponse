import { withTransaction, type TransactionClient } from "@/lib/db";
import { structuredLog } from "@/lib/observability/logger";
import { writeAuditEvent } from "@/modules/audit/service";
import {
  countActiveKnowledge,
  requireUsablePlanInTransaction,
} from "@/modules/billing/entitlements";
import { PlanEntitlementError, PLAN_ERROR_CODES } from "@/modules/billing/errors";
import * as knowledgeRepo from "@/modules/knowledge/repository";
import {
  ensureDefaultKnowledgeBase,
  listItems,
} from "@/modules/knowledge/service";

import { KnowledgeIngestError } from "./analyze-service";
import { findCandidatesForFact } from "./candidate-retrieval";
import {
  jaccard,
  mergeContents,
  normalizeText,
  tokenize,
} from "./normalize";
import * as repo from "./repository";
import type { KnowledgeIngestProposal } from "./types";

export type ApplyResult = {
  sessionId: string;
  status: "APPLIED" | "ALREADY_APPLIED";
  applied: {
    created: number;
    merged: number;
    skipped: number;
    conflictsResolved: number;
  };
  remainingKnowledgeSlots: number | null;
};

function isStale(
  proposal: KnowledgeIngestProposal,
  currentUpdatedAt: Date | null | undefined,
): boolean {
  if (!proposal.existingUpdatedAtUtc || !currentUpdatedAt) return false;
  return (
    new Date(currentUpdatedAt).getTime()
    !== new Date(proposal.existingUpdatedAtUtc).getTime()
  );
}

function looksDuplicateOf(
  title: string,
  content: string,
  items: Array<{ title: string; content: string; category: string }>,
  category: string,
): boolean {
  const tokens = tokenize(`${title} ${content}`);
  for (const item of items) {
    if (item.category !== category) continue;
    const score = jaccard(tokens, tokenize(`${item.title} ${item.content}`));
    if (
      score >= 0.85
      || normalizeText(item.content).includes(normalizeText(content))
      || normalizeText(content).includes(normalizeText(item.content))
    ) {
      return true;
    }
  }
  return false;
}

export async function updateProposalSelection(params: {
  businessId: string;
  proposalId: string;
  selected?: boolean;
  resolution?: "USE_NEW" | "KEEP_EXISTING" | "MANUAL" | null;
  proposedTitle?: string;
  proposedContent?: string;
}): Promise<KnowledgeIngestProposal> {
  const existing = await repo.getProposal(params);
  if (!existing) {
    throw new KnowledgeIngestError("PROPOSAL_NOT_FOUND", "الاقتراح غير موجود.", 404);
  }

  let selected = params.selected;
  let status = existing.status;
  const resolution = params.resolution;

  if (existing.action === "CONFLICT" && resolution) {
    if (resolution === "KEEP_EXISTING") {
      selected = false;
      status = "RESOLVED";
    } else if (resolution === "USE_NEW" || resolution === "MANUAL") {
      selected = true;
      status = "RESOLVED";
    }
  }

  if (existing.action === "NOOP") {
    selected = false;
  }

  const updated = await repo.updateProposal({
    businessId: params.businessId,
    proposalId: params.proposalId,
    selected,
    resolution: resolution === undefined ? undefined : resolution,
    proposedTitle: params.proposedTitle,
    proposedContent: params.proposedContent,
    status: status === existing.status ? undefined : status,
  });
  if (!updated) {
    throw new KnowledgeIngestError("PROPOSAL_NOT_FOUND", "الاقتراح غير موجود.", 404);
  }
  return updated;
}

async function assertLockedNotStale(
  params: {
    businessId: string;
    proposal: KnowledgeIngestProposal;
  },
  trx: TransactionClient,
): Promise<NonNullable<Awaited<ReturnType<typeof knowledgeRepo.lockKnowledgeItemForUpdate>>>> {
  const p = params.proposal;
  if (!p.existingKnowledgeItemId) {
    throw new KnowledgeIngestError(
      "STALE_PROPOSAL",
      "تغيرت المعرفة الحالية. أعد التحليل ثم اعتمد من جديد.",
      409,
    );
  }
  const current = await knowledgeRepo.lockKnowledgeItemForUpdate(
    {
      businessId: params.businessId,
      knowledgeItemId: p.existingKnowledgeItemId,
    },
    trx,
  );
  if (!current || isStale(p, current.updatedAtUtc)) {
    await repo.updateProposal(
      {
        businessId: params.businessId,
        proposalId: p.proposalId,
        status: "STALE",
        selected: false,
      },
      trx,
    );
    throw new KnowledgeIngestError(
      "STALE_PROPOSAL",
      "تغيرت المعرفة الحالية. أعد التحليل ثم اعتمد من جديد.",
      409,
    );
  }
  return current;
}

export async function applyKnowledgeIngest(params: {
  businessId: string;
  userId: string;
  sessionId: string;
  proposalIds?: string[];
}): Promise<ApplyResult> {
  const result = await withTransaction(async (trx) => {
    await repo.acquireKnowledgeIngestAppLock(params.businessId, trx);

    const session = await repo.lockSession(
      { businessId: params.businessId, sessionId: params.sessionId },
      trx,
    );
    if (!session) {
      throw new KnowledgeIngestError("SESSION_NOT_FOUND", "الجلسة غير موجودة.", 404);
    }

    const { plan } = await requireUsablePlanInTransaction(
      params.businessId,
      trx,
    );
    const limit = plan.maxActiveKnowledgeItems ?? null;

    if (session.status === "APPLIED") {
      const used = await countActiveKnowledge(params.businessId, trx);
      return {
        sessionId: session.sessionId,
        status: "ALREADY_APPLIED" as const,
        applied: { created: 0, merged: 0, skipped: 0, conflictsResolved: 0 },
        remainingKnowledgeSlots:
          limit == null ? null : Math.max(0, limit - used),
      };
    }

    if (session.status !== "REVIEW") {
      throw new KnowledgeIngestError(
        "SESSION_NOT_READY",
        "الجلسة غير جاهزة للاعتماد بعد.",
      );
    }

    const all = await repo.listProposals(
      {
        businessId: params.businessId,
        sessionId: params.sessionId,
      },
      trx,
    );

    const idFilter = params.proposalIds ? new Set(params.proposalIds) : null;

    const selected = all.filter((p) => {
      if (idFilter && !idFilter.has(p.proposalId)) return false;
      if (p.action === "NOOP") return false;
      if (p.action === "CONFLICT") {
        return (
          p.selected
          && (p.resolution === "USE_NEW" || p.resolution === "MANUAL")
        );
      }
      return p.selected;
    });

    for (const p of selected) {
      if (p.action === "CONFLICT" && !p.resolution) {
        throw new KnowledgeIngestError(
          "UNRESOLVED_CONFLICT",
          "هناك تعارضات تحتاج اختيارك قبل الاعتماد.",
        );
      }
    }

    const createCandidates = selected.filter((p) => p.action === "CREATE");
    const used = await countActiveKnowledge(params.businessId, trx);
    if (limit != null && used + createCandidates.length > limit) {
      const remaining = Math.max(0, limit - used);
      throw new KnowledgeIngestError(
        "PLAN_KNOWLEDGE_LIMIT",
        `مساحة المعرفة المتبقية تسمح بإضافة ${remaining} معلومة جديدة فقط. قلّل الاختيارات أو عطّل معلومات قديمة.`,
      );
    }

    // Preflight locked stale checks for MERGE/CONFLICT targets
    for (const p of selected) {
      if (!p.existingKnowledgeItemId) continue;
      if (
        p.action === "MERGE"
        || (p.action === "CONFLICT"
          && (p.resolution === "USE_NEW" || p.resolution === "MANUAL"))
      ) {
        await assertLockedNotStale(
          { businessId: params.businessId, proposal: p },
          trx,
        );
      }
    }

    let created = 0;
    let merged = 0;
    let skipped = 0;
    let conflictsResolved = 0;

    const existingForDup = await listItems(
      {
        businessId: params.businessId,
        includeInactive: true,
      },
      trx,
    );

    const base = await ensureDefaultKnowledgeBase(
      { businessId: params.businessId },
      trx,
    );

    for (const p of selected) {
      if (p.action === "CREATE") {
        if (
          looksDuplicateOf(
            p.proposedTitle,
            p.proposedContent,
            existingForDup,
            p.category,
          )
        ) {
          await repo.updateProposal(
            {
              businessId: params.businessId,
              proposalId: p.proposalId,
              status: "SKIPPED",
              selected: false,
            },
            trx,
          );
          skipped += 1;
          continue;
        }

        const candidates = findCandidatesForFact(
          {
            tempId: p.proposalId,
            category: p.category,
            title: p.proposedTitle,
            content: p.proposedContent,
            subject: p.proposedTitle,
          },
          existingForDup,
        );
        const strong = candidates[0];
        if (
          strong
          && jaccard(
            tokenize(`${p.proposedTitle} ${p.proposedContent}`),
            tokenize(`${strong.title} ${strong.content}`),
          ) >= 0.85
        ) {
          await repo.updateProposal(
            {
              businessId: params.businessId,
              proposalId: p.proposalId,
              status: "SKIPPED",
              selected: false,
            },
            trx,
          );
          skipped += 1;
          continue;
        }

        const usedNow = await countActiveKnowledge(params.businessId, trx);
        if (limit != null && usedNow + 1 > limit) {
          throw new PlanEntitlementError(PLAN_ERROR_CODES.KNOWLEDGE_LIMIT);
        }

        const item = await knowledgeRepo.createKnowledgeItem(
          {
            businessId: params.businessId,
            knowledgeBaseId: base.knowledgeBaseId,
            category: p.category,
            title: p.proposedTitle,
            content: p.proposedContent,
            isActive: true,
          },
          trx,
        );
        existingForDup.push(item);
        await repo.updateProposal(
          {
            businessId: params.businessId,
            proposalId: p.proposalId,
            status: "APPLIED",
          },
          trx,
        );
        created += 1;
        continue;
      }

      if (
        p.action === "MERGE"
        || (p.action === "CONFLICT"
          && (p.resolution === "USE_NEW" || p.resolution === "MANUAL"))
      ) {
        if (!p.existingKnowledgeItemId) {
          skipped += 1;
          continue;
        }

        const current = await assertLockedNotStale(
          { businessId: params.businessId, proposal: p },
          trx,
        );

        const nextContent =
          p.action === "MERGE"
            ? mergeContents(current.content, p.proposedContent)
            : p.proposedContent;

        const updated = await knowledgeRepo.updateKnowledgeItem(
          {
            businessId: params.businessId,
            knowledgeItemId: p.existingKnowledgeItemId,
            title: p.proposedTitle || current.title,
            content: nextContent,
            category: p.category,
          },
          trx,
        );
        if (!updated) {
          throw new KnowledgeIngestError(
            "STALE_PROPOSAL",
            "تغيرت المعرفة الحالية. أعد التحليل ثم اعتمد من جديد.",
            409,
          );
        }

        await repo.updateProposal(
          {
            businessId: params.businessId,
            proposalId: p.proposalId,
            status: "APPLIED",
          },
          trx,
        );
        if (p.action === "MERGE") merged += 1;
        else conflictsResolved += 1;
      }
    }

    for (const p of all) {
      if (p.status === "PENDING" && (p.action === "NOOP" || !p.selected)) {
        await repo.updateProposal(
          {
            businessId: params.businessId,
            proposalId: p.proposalId,
            status: "SKIPPED",
          },
          trx,
        );
      }
    }

    await repo.updateSession(
      {
        businessId: params.businessId,
        sessionId: session.sessionId,
        status: "APPLIED",
        appliedAtUtc: new Date(),
        clearRawInput: true,
        clearConversation: true,
      },
      trx,
    );

    const usedAfter = await countActiveKnowledge(params.businessId, trx);

    await writeAuditEvent(
      {
        businessId: params.businessId,
        actorUserId: params.userId,
        action: "KNOWLEDGE_INGEST_APPLIED",
        entityType: "KnowledgeIngestSession",
        entityId: session.sessionId,
        metadata: {
          created,
          merged,
          skipped,
          conflictsResolved,
        },
      },
      trx,
    );

    return {
      sessionId: session.sessionId,
      status: "APPLIED" as const,
      applied: {
        created,
        merged,
        skipped,
        conflictsResolved,
      },
      remainingKnowledgeSlots:
        limit == null ? null : Math.max(0, limit - usedAfter),
    };
  });

  // Only reached after successful COMMIT.
  if (result.status === "APPLIED") {
    structuredLog("knowledge-ai", "knowledge_ingest.applied", {
      businessId: params.businessId,
      sessionId: result.sessionId,
      createCount: result.applied.created,
      mergeCount: result.applied.merged,
      skippedCount: result.applied.skipped,
      conflictResolvedCount: result.applied.conflictsResolved,
    });
  }

  return result;
}
