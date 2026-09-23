import { randomUUID } from "node:crypto";

import { structuredLog } from "@/lib/observability/logger";
import { writeAuditEvent } from "@/modules/audit/service";
import { AiProviderError } from "@/modules/ai/gemini-provider";
import { listItems } from "@/modules/knowledge/service";

import { buildCandidatesByFact } from "./candidate-retrieval";
import { chunkText } from "./chunk";
import {
  KNOWLEDGE_INGEST_INPUT_MAX,
  KNOWLEDGE_INGEST_MAX_FACTS,
} from "./constants";
import type { KnowledgeExtractProvider } from "./gemini-knowledge-provider";
import { createGeminiKnowledgeProvider } from "./gemini-knowledge-provider";
import {
  clampContent,
  clampTitle,
  dedupeExtractedFacts,
  hashInput,
  subjectKey,
} from "./normalize";
import * as repo from "./repository";
import { heuristicResolveDedup } from "./resolve-dedup";
import type {
  ConversationTurn,
  ExtractedFact,
  IngestSummary,
  KnowledgeIngestProposal,
  KnowledgeIngestSession,
} from "./types";

export class KnowledgeIngestError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, message: string, statusCode = 400) {
    super(message);
    this.name = "KnowledgeIngestError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

export type AnalyzeResult = {
  session: KnowledgeIngestSession;
  proposals: KnowledgeIngestProposal[];
};

function friendlyProviderMessage(error: unknown): KnowledgeIngestError {
  if (error instanceof KnowledgeIngestError) return error;
  if (error instanceof AiProviderError) {
    if (error.code === "GEMINI_NOT_CONFIGURED") {
      return new KnowledgeIngestError(
        "AI_UNAVAILABLE",
        "تحليل المعرفة غير متاح حالياً. حاول لاحقاً.",
        503,
      );
    }
    if (error.code === "GEMINI_TIMEOUT") {
      return new KnowledgeIngestError(
        "AI_TIMEOUT",
        "استغرق التحليل وقتاً أطول من المتوقع. حاول مرة أخرى بنص أقصر.",
        504,
      );
    }
    return new KnowledgeIngestError(
      "AI_FAILED",
      "تعذر تحليل المعلومات الآن. حاول مرة أخرى.",
      502,
    );
  }
  return new KnowledgeIngestError(
    "ANALYZE_FAILED",
    "تعذر تحليل المعلومات الآن. حاول مرة أخرى.",
    500,
  );
}

async function extractAllFacts(
  provider: KnowledgeExtractProvider,
  text: string,
): Promise<{ facts: ExtractedFact[]; clarifications: string[] }> {
  const chunks = chunkText(text);
  const all: ExtractedFact[] = [];
  const clarifications: string[] = [];

  for (const [index, chunk] of chunks.entries()) {
    const result = await provider.extractFacts(chunk);
    clarifications.push(...result.clarifications);
    for (const [fi, fact] of result.facts.entries()) {
      all.push({
        ...fact,
        tempId: fact.tempId || `c${index + 1}_f${fi + 1}`,
        title: clampTitle(fact.title),
        content: clampContent(fact.content),
        subject: clampTitle(fact.subject || fact.title),
      });
    }
  }

  const deduped = dedupeExtractedFacts(all).map((f, i) => ({
    ...f,
    tempId: `F${i + 1}`,
  }));

  if (deduped.length > KNOWLEDGE_INGEST_MAX_FACTS) {
    throw new KnowledgeIngestError(
      "TOO_MANY_FACTS",
      "المعلومات كثيرة جداً دفعة واحدة. قسّم النص على أكثر من مرة ثم أعد التحليل.",
      400,
    );
  }

  return { facts: deduped, clarifications: [...new Set(clarifications)] };
}

function buildSummary(
  proposals: Array<{ action: string }>,
  clarifications: string[],
): IngestSummary {
  const counts = { create: 0, merge: 0, noop: 0, conflict: 0 };
  for (const p of proposals) {
    if (p.action === "CREATE") counts.create += 1;
    else if (p.action === "MERGE") counts.merge += 1;
    else if (p.action === "NOOP") counts.noop += 1;
    else if (p.action === "CONFLICT") counts.conflict += 1;
  }
  return {
    total: proposals.length,
    ...counts,
    clarifications,
  };
}

export async function analyzeKnowledgeIngest(params: {
  businessId: string;
  userId: string;
  text: string;
  sessionId?: string | null;
  provider?: KnowledgeExtractProvider;
  /** When true, skip Gemini semantic resolver and use heuristic only (tests). */
  useHeuristicDedup?: boolean;
}): Promise<AnalyzeResult> {
  const text = params.text.trim();
  if (!text) {
    throw new KnowledgeIngestError("EMPTY_INPUT", "اكتب أو الصق معلومات النشاط أولاً.");
  }
  if (text.length > KNOWLEDGE_INGEST_INPUT_MAX) {
    throw new KnowledgeIngestError(
      "INPUT_TOO_LONG",
      "النص أطول من الحد المسموح. اختصر ثم أعد المحاولة.",
    );
  }

  const provider =
    params.provider
    ?? createGeminiKnowledgeProvider();

  const started = Date.now();
  let session: KnowledgeIngestSession | null = null;

  try {
    const nowIso = new Date().toISOString();
    let conversation: ConversationTurn[] = [];

    if (params.sessionId) {
      session = await repo.getSession({
        businessId: params.businessId,
        sessionId: params.sessionId,
      });
      if (!session) {
        throw new KnowledgeIngestError("SESSION_NOT_FOUND", "الجلسة غير موجودة.", 404);
      }
      if (session.status === "APPLIED") {
        throw new KnowledgeIngestError(
          "SESSION_APPLIED",
          "تم اعتماد هذه الجلسة مسبقاً. ابدأ تحليلاً جديداً.",
        );
      }
      conversation = [
        ...session.conversation,
        { role: "user", text, at: nowIso },
      ];
      await repo.updateSession({
        businessId: params.businessId,
        sessionId: session.sessionId,
        status: "ANALYZING",
        rawInput: text,
        conversation,
        inputHash: hashInput(text),
        inputLength: text.length,
        model: provider.model,
        errorCode: null,
      });
    } else {
      conversation = [{ role: "user", text, at: nowIso }];
      session = await repo.createSession({
        businessId: params.businessId,
        createdByUserId: params.userId,
        rawInput: text,
        conversation,
        inputHash: hashInput(text),
        inputLength: text.length,
        model: provider.model,
        status: "ANALYZING",
      });
    }

    // Composite text for multi-turn: join user turns
    const composite = conversation
      .filter((t) => t.role === "user")
      .map((t) => t.text)
      .join("\n\n");

    const { facts, clarifications } = await extractAllFacts(provider, composite);
    if (facts.length === 0) {
      const emptySummary = buildSummary([], clarifications.length
        ? clarifications
        : ["لم أجد معلومات واضحة يمكن إضافتها. جرّب نصاً أوضح."]);
      conversation = [
        ...conversation,
        {
          role: "assistant",
          text: "لم أستطع استخراج معلومات واضحة من النص.",
          at: new Date().toISOString(),
        },
      ];
      await repo.deleteProposalsForSession({ sessionId: session.sessionId });
      await repo.updateSession({
        businessId: params.businessId,
        sessionId: session.sessionId,
        status: "REVIEW",
        conversation,
        summary: emptySummary,
        model: provider.model,
      });
      const refreshed = await repo.getSession({
        businessId: params.businessId,
        sessionId: session.sessionId,
      });
      return { session: refreshed!, proposals: [] };
    }

    const existingItems = await listItems({
      businessId: params.businessId,
      includeInactive: true,
    });
    const candidatesByFact = buildCandidatesByFact(facts, existingItems);

    const dedup = params.useHeuristicDedup
      ? heuristicResolveDedup({ facts, candidatesByFact })
      : await provider
          .resolveDedup({ facts, candidatesByFact })
          .catch(() => heuristicResolveDedup({ facts, candidatesByFact }));

    // Validate aliases map only to provided candidates
    const proposalRows: Parameters<typeof repo.insertProposals>[0] = [];
    let sequence = 0;
    for (const fact of facts) {
      const decision = dedup.decisions.find((d) => d.tempId === fact.tempId)
        ?? {
          tempId: fact.tempId,
          action: "CREATE" as const,
          candidateAlias: null,
          proposedTitle: fact.title,
          proposedContent: fact.content,
        };

      const candidates = candidatesByFact[fact.tempId] ?? [];
      const aliasMap = new Map(candidates.map((c) => [c.alias, c]));
      let action = decision.action;
      let matched =
        decision.candidateAlias && aliasMap.has(decision.candidateAlias)
          ? aliasMap.get(decision.candidateAlias)!
          : null;

      if ((action === "MERGE" || action === "NOOP" || action === "CONFLICT") && !matched) {
        // Fallback to heuristic for this fact
        const local = heuristicResolveDedup({
          facts: [fact],
          candidatesByFact: { [fact.tempId]: candidates },
        }).decisions[0]!;
        action = local.action;
        matched =
          local.candidateAlias && aliasMap.has(local.candidateAlias)
            ? aliasMap.get(local.candidateAlias)!
            : null;
        if ((action === "MERGE" || action === "NOOP" || action === "CONFLICT") && !matched) {
          action = "CREATE";
        }
      }

      sequence += 1;
      const selected = action === "CREATE" || action === "MERGE";
      proposalRows.push({
        sessionId: session.sessionId,
        sequence,
        action,
        category: fact.category,
        proposedTitle: clampTitle(decision.proposedTitle || fact.title),
        proposedContent: clampContent(decision.proposedContent || fact.content),
        existingKnowledgeItemId: matched?.knowledgeItemId ?? null,
        existingTitle: matched?.title ?? null,
        existingContent: matched?.content ?? null,
        existingUpdatedAtUtc: matched?.updatedAtUtc ?? null,
        confidence: fact.confidence ?? null,
        selected,
        status: "PENDING",
        subjectKey: subjectKey(fact),
      });
    }

    await repo.deleteProposalsForSession({ sessionId: session.sessionId });
    await repo.insertProposals(proposalRows);

    const summary = buildSummary(proposalRows, clarifications);
    const assistantText = [
      `حللت المعلومات ووجدت ${summary.total} معلومة.`,
      `${summary.create} معلومات جديدة`,
      `${summary.merge} تحديثات لمعلومات موجودة`,
      `${summary.noop} موجودة بالفعل`,
      `${summary.conflict} تحتاج مراجعة`,
    ].join("\n");

    conversation = [
      ...conversation,
      { role: "assistant", text: assistantText, at: new Date().toISOString() },
    ];

    await repo.updateSession({
      businessId: params.businessId,
      sessionId: session.sessionId,
      status: "REVIEW",
      conversation,
      summary,
      model: provider.model,
      errorCode: null,
    });

    structuredLog("knowledge-ai", "knowledge_ingest.analyzed", {
      businessId: params.businessId,
      sessionId: session.sessionId,
      inputLength: text.length,
      factCount: summary.total,
      createCount: summary.create,
      mergeCount: summary.merge,
      noopCount: summary.noop,
      conflictCount: summary.conflict,
      latencyMs: Date.now() - started,
      model: provider.model,
    });

    await writeAuditEvent({
      businessId: params.businessId,
      actorUserId: params.userId,
      action: "KNOWLEDGE_INGEST_ANALYZED",
      entityType: "KnowledgeIngestSession",
      entityId: session.sessionId,
      metadata: {
        factCount: summary.total,
        createCount: summary.create,
        mergeCount: summary.merge,
        noopCount: summary.noop,
        conflictCount: summary.conflict,
        model: provider.model,
      },
    });

    const [refreshed, proposals] = await Promise.all([
      repo.getSession({
        businessId: params.businessId,
        sessionId: session.sessionId,
      }),
      repo.listProposals({
        businessId: params.businessId,
        sessionId: session.sessionId,
      }),
    ]);

    return { session: refreshed!, proposals };
  } catch (error) {
    const mapped = friendlyProviderMessage(error);
    if (session) {
      await repo.updateSession({
        businessId: params.businessId,
        sessionId: session.sessionId,
        status: "FAILED",
        errorCode: mapped.code,
      }).catch(() => undefined);
    }
    structuredLog("knowledge-ai", "knowledge_ingest.analyze_failed", {
      businessId: params.businessId,
      sessionId: session?.sessionId ?? null,
      errorCode: mapped.code,
      latencyMs: Date.now() - started,
    });
    throw mapped;
  }
}

export async function getIngestSessionView(params: {
  businessId: string;
  sessionId: string;
}): Promise<AnalyzeResult> {
  const session = await repo.getSession(params);
  if (!session) {
    throw new KnowledgeIngestError("SESSION_NOT_FOUND", "الجلسة غير موجودة.", 404);
  }
  const proposals = await repo.listProposals(params);
  return { session, proposals };
}

/** Test helper — unique temp ids */
export function newTempId(): string {
  return randomUUID().slice(0, 8);
}
