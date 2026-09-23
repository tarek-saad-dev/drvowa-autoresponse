import { randomUUID } from "node:crypto";

import { withTransaction } from "@/lib/db";
import { structuredLog } from "@/lib/observability/logger";
import { writeAuditEvent } from "@/modules/audit/service";
import { AiProviderError } from "@/modules/ai/gemini-provider";
import { listItems } from "@/modules/knowledge/service";

import { buildCandidatesByFact } from "./candidate-retrieval";
import { chunkText, splitDenseChunk } from "./chunk";
import {
  KNOWLEDGE_INGEST_ADAPTIVE_SPLIT_MAX_DEPTH,
  KNOWLEDGE_INGEST_INPUT_MAX,
  KNOWLEDGE_INGEST_MAX_FACTS,
  KNOWLEDGE_INGEST_SESSION_SOURCE_MAX,
} from "./constants";
import type { KnowledgeExtractProvider } from "./gemini-knowledge-provider";
import { createGeminiKnowledgeProvider } from "./gemini-knowledge-provider";
import type { ExtractionResponse } from "./extract-schema";
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

const DEDUP_RETRY_MESSAGE =
  "تعذر مراجعة المعلومات الحالية الآن. حاول مرة أخرى.";

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

function totalUserSourceChars(conversation: ConversationTurn[]): number {
  return conversation
    .filter((t) => t.role === "user")
    .reduce((sum, t) => sum + t.text.length, 0);
}

function isTruncationError(error: unknown): boolean {
  return (
    error instanceof AiProviderError && error.code === "GEMINI_TRUNCATED"
  );
}

/**
 * Extract one chunk; on truncation, adaptively split and retry with a hard depth bound.
 * Exported for unit tests.
 */
export async function extractChunkAdaptive(
  provider: KnowledgeExtractProvider,
  chunk: string,
  depth = 0,
): Promise<ExtractionResponse> {
  try {
    return await provider.extractFacts(chunk);
  } catch (error) {
    if (!isTruncationError(error) || depth >= KNOWLEDGE_INGEST_ADAPTIVE_SPLIT_MAX_DEPTH) {
      throw error;
    }
    const parts = splitDenseChunk(chunk);
    if (!parts) throw error;
    structuredLog("knowledge-ai", "knowledge_ingest.adaptive_split", {
      depth,
      chunkLength: chunk.length,
      leftLength: parts[0].length,
      rightLength: parts[1].length,
    });
    const left = await extractChunkAdaptive(provider, parts[0], depth + 1);
    const right = await extractChunkAdaptive(provider, parts[1], depth + 1);
    return {
      facts: [...left.facts, ...right.facts],
      clarifications: [...left.clarifications, ...right.clarifications],
    };
  }
}

/**
 * Multi-chunk extraction with adaptive split on truncation.
 * Exported for unit tests.
 */
export async function extractAllFacts(
  provider: KnowledgeExtractProvider,
  text: string,
): Promise<{ facts: ExtractedFact[]; clarifications: string[] }> {
  const chunks = chunkText(text);
  const all: ExtractedFact[] = [];
  const clarifications: string[] = [];

  for (const [index, chunk] of chunks.entries()) {
    const result = await extractChunkAdaptive(provider, chunk);
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

function hasAmbiguousCandidates(
  facts: ExtractedFact[],
  candidatesByFact: Record<string, Array<unknown>>,
): boolean {
  return facts.some((f) => (candidatesByFact[f.tempId] ?? []).length > 0);
}

/**
 * Production: semantic resolver required when candidates exist.
 * Tests/mock: explicit heuristic via useHeuristicDedup.
 * Never silently MERGE on semantic failure when candidates exist.
 */
export async function resolveDedupSafely(params: {
  provider: KnowledgeExtractProvider;
  facts: ExtractedFact[];
  candidatesByFact: Record<
    string,
    import("./types").CandidateAlias[]
  >;
  useHeuristicDedup?: boolean;
}): Promise<ReturnType<typeof heuristicResolveDedup>> {
  if (params.useHeuristicDedup) {
    return heuristicResolveDedup({
      facts: params.facts,
      candidatesByFact: params.candidatesByFact,
    });
  }

  try {
    return await params.provider.resolveDedup({
      facts: params.facts,
      candidatesByFact: params.candidatesByFact,
    });
  } catch {
    if (hasAmbiguousCandidates(params.facts, params.candidatesByFact)) {
      throw new KnowledgeIngestError(
        "DEDUP_UNAVAILABLE",
        DEDUP_RETRY_MESSAGE,
        502,
      );
    }
    // No candidates → CREATE-only is safe via deterministic heuristic
    return heuristicResolveDedup({
      facts: params.facts,
      candidatesByFact: params.candidatesByFact,
    });
  }
}

async function beginAnalysis(params: {
  businessId: string;
  userId: string;
  text: string;
  sessionId?: string | null;
  model: string;
}): Promise<{
  session: KnowledgeIngestSession;
  analysisVersion: number;
  /** Committed conversation only (no pending user turn). */
  committedConversation: ConversationTurn[];
  pendingUserText: string;
  pendingUserAt: string;
}> {
  return withTransaction(async (trx) => {
    const nowIso = new Date().toISOString();

    if (params.sessionId) {
      const locked = await repo.lockSession(
        { businessId: params.businessId, sessionId: params.sessionId },
        trx,
      );
      if (!locked) {
        throw new KnowledgeIngestError(
          "SESSION_NOT_FOUND",
          "الجلسة غير موجودة.",
          404,
        );
      }
      if (locked.status === "APPLIED") {
        throw new KnowledgeIngestError(
          "SESSION_APPLIED",
          "تم اعتماد هذه الجلسة مسبقاً. ابدأ تحليلاً جديداً.",
        );
      }
      if (locked.status === "CANCELED") {
        throw new KnowledgeIngestError(
          "SESSION_CANCELED",
          "هذه الجلسة ملغاة. ابدأ تحليلاً جديداً.",
        );
      }
      if (locked.status === "ANALYZING") {
        throw new KnowledgeIngestError(
          "ANALYSIS_IN_PROGRESS",
          "جارٍ تحليل هذه الجلسة الآن. انتظر ثم أعد المحاولة.",
          409,
        );
      }

      const priorChars = totalUserSourceChars(locked.conversation);
      if (priorChars + params.text.length > KNOWLEDGE_INGEST_SESSION_SOURCE_MAX) {
        throw new KnowledgeIngestError(
          "SESSION_TOO_LARGE",
          "المعلومات في هذه الجلسة أصبحت كبيرة جداً. اعتمد التغييرات الحالية أو ابدأ جلسة جديدة.",
          400,
        );
      }

      const analysisVersion = locked.analysisVersion + 1;

      // Pending source only — do NOT append user turn until analysis succeeds.
      await repo.updateSession(
        {
          businessId: params.businessId,
          sessionId: locked.sessionId,
          status: "ANALYZING",
          rawInput: params.text,
          inputHash: hashInput(params.text),
          inputLength: params.text.length,
          model: params.model,
          errorCode: null,
          analysisVersion,
        },
        trx,
      );

      const session = await repo.getSession(
        { businessId: params.businessId, sessionId: locked.sessionId },
        trx,
      );
      return {
        session: session!,
        analysisVersion,
        committedConversation: locked.conversation,
        pendingUserText: params.text,
        pendingUserAt: nowIso,
      };
    }

    if (params.text.length > KNOWLEDGE_INGEST_SESSION_SOURCE_MAX) {
      throw new KnowledgeIngestError(
        "SESSION_TOO_LARGE",
        "المعلومات في هذه الجلسة أصبحت كبيرة جداً. اعتمد التغييرات الحالية أو ابدأ جلسة جديدة.",
        400,
      );
    }

    // Brand-new session: ConversationJson stays [] until first successful finalize.
    const session = await repo.createSession(
      {
        businessId: params.businessId,
        createdByUserId: params.userId,
        rawInput: params.text,
        conversation: [],
        inputHash: hashInput(params.text),
        inputLength: params.text.length,
        model: params.model,
        status: "ANALYZING",
        analysisVersion: 1,
      },
      trx,
    );
    return {
      session,
      analysisVersion: 1,
      committedConversation: [],
      pendingUserText: params.text,
      pendingUserAt: nowIso,
    };
  });
}

async function finalizeAnalysis(params: {
  businessId: string;
  userId: string;
  sessionId: string;
  analysisVersion: number;
  conversation: ConversationTurn[];
  summary: IngestSummary;
  model: string;
  proposalRows: Parameters<typeof repo.insertProposals>[0];
}): Promise<{
  session: KnowledgeIngestSession;
  proposals: KnowledgeIngestProposal[];
}> {
  return withTransaction(async (trx) => {
    const locked = await repo.lockSession(
      { businessId: params.businessId, sessionId: params.sessionId },
      trx,
    );
    if (!locked) {
      throw new KnowledgeIngestError(
        "SESSION_NOT_FOUND",
        "الجلسة غير موجودة.",
        404,
      );
    }
    if (
      locked.analysisVersion !== params.analysisVersion
      || locked.status !== "ANALYZING"
    ) {
      throw new KnowledgeIngestError(
        "ANALYSIS_SUPERSEDED",
        "تم تحديث التحليل بطلب أحدث. حاول مرة أخرى.",
        409,
      );
    }

    await repo.deleteProposalsForSession(
      { sessionId: params.sessionId },
      trx,
    );
    await repo.insertProposals(params.proposalRows, trx);

    await repo.updateSession(
      {
        businessId: params.businessId,
        sessionId: params.sessionId,
        status: "REVIEW",
        conversation: params.conversation,
        summary: params.summary,
        model: params.model,
        errorCode: null,
      },
      trx,
    );

    await writeAuditEvent(
      {
        businessId: params.businessId,
        actorUserId: params.userId,
        action: "KNOWLEDGE_INGEST_ANALYZED",
        entityType: "KnowledgeIngestSession",
        entityId: params.sessionId,
        metadata: {
          factCount: params.summary.total,
          createCount: params.summary.create,
          mergeCount: params.summary.merge,
          noopCount: params.summary.noop,
          conflictCount: params.summary.conflict,
          model: params.model,
          analysisVersion: params.analysisVersion,
        },
      },
      trx,
    );

    const session = await repo.getSession(
      { businessId: params.businessId, sessionId: params.sessionId },
      trx,
    );
    const proposals = await repo.listProposals(
      { businessId: params.businessId, sessionId: params.sessionId },
      trx,
    );
    return { session: session!, proposals };
  });
}

async function markAnalysisFailed(params: {
  businessId: string;
  sessionId: string;
  analysisVersion: number;
  errorCode: string;
}): Promise<void> {
  await withTransaction(async (trx) => {
    const locked = await repo.lockSession(
      { businessId: params.businessId, sessionId: params.sessionId },
      trx,
    );
    if (
      !locked
      || locked.analysisVersion !== params.analysisVersion
      || locked.status !== "ANALYZING"
    ) {
      return;
    }
    await repo.updateSession(
      {
        businessId: params.businessId,
        sessionId: params.sessionId,
        status: "FAILED",
        errorCode: params.errorCode,
        // Clear pending paste; keep committed ConversationJson unchanged.
        clearRawInput: true,
      },
      trx,
    );
  }).catch(() => undefined);
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
  let sessionId: string | null = null;
  let analysisVersion = 0;
  let failurePhase: "begin" | "extraction" | "dedup" | "finalize" = "begin";

  try {
    const begun = await beginAnalysis({
      businessId: params.businessId,
      userId: params.userId,
      text,
      sessionId: params.sessionId,
      model: provider.model,
    });
    sessionId = begun.session.sessionId;
    analysisVersion = begun.analysisVersion;

    const pendingUserTurn: ConversationTurn = {
      role: "user",
      text: begun.pendingUserText,
      at: begun.pendingUserAt,
    };
    const workingConversation: ConversationTurn[] = [
      ...begun.committedConversation,
      pendingUserTurn,
    ];

    const composite = workingConversation
      .filter((t) => t.role === "user")
      .map((t) => t.text)
      .join("\n\n");

    failurePhase = "extraction";
    const { facts, clarifications } = await extractAllFacts(provider, composite);

    if (facts.length === 0) {
      const emptySummary = buildSummary(
        [],
        clarifications.length
          ? clarifications
          : ["لم أجد معلومات واضحة يمكن إضافتها. جرّب نصاً أوضح."],
      );
      const conversation: ConversationTurn[] = [
        ...workingConversation,
        {
          role: "assistant",
          text: "لم أستطع استخراج معلومات واضحة من النص.",
          at: new Date().toISOString(),
        },
      ];
      failurePhase = "finalize";
      const finalized = await finalizeAnalysis({
        businessId: params.businessId,
        userId: params.userId,
        sessionId,
        analysisVersion,
        conversation,
        summary: emptySummary,
        model: provider.model,
        proposalRows: [],
      });
      structuredLog("knowledge-ai", "knowledge_ingest.analyzed", {
        businessId: params.businessId,
        sessionId,
        inputLength: text.length,
        factCount: 0,
        createCount: 0,
        mergeCount: 0,
        noopCount: 0,
        conflictCount: 0,
        latencyMs: Date.now() - started,
        model: provider.model,
      });
      return finalized;
    }

    const existingItems = await listItems({
      businessId: params.businessId,
      includeInactive: true,
    });
    const candidatesByFact = buildCandidatesByFact(facts, existingItems);

    failurePhase = "dedup";
    const dedup = await resolveDedupSafely({
      provider,
      facts,
      candidatesByFact,
      useHeuristicDedup: params.useHeuristicDedup,
    });

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

      // Invalid alias for non-CREATE → treat as CREATE only when no candidates;
      // with candidates, fall back to heuristic for this fact (deterministic).
      if (
        (action === "MERGE" || action === "NOOP" || action === "CONFLICT")
        && !matched
      ) {
        if (candidates.length === 0) {
          action = "CREATE";
        } else if (params.useHeuristicDedup) {
          const local = heuristicResolveDedup({
            facts: [fact],
            candidatesByFact: { [fact.tempId]: candidates },
          }).decisions[0]!;
          action = local.action;
          matched =
            local.candidateAlias && aliasMap.has(local.candidateAlias)
              ? aliasMap.get(local.candidateAlias)!
              : null;
          if (
            (action === "MERGE" || action === "NOOP" || action === "CONFLICT")
            && !matched
          ) {
            action = "CREATE";
          }
        } else {
          // Production semantic path returned unusable alias — fail safe
          throw new KnowledgeIngestError(
            "DEDUP_UNAVAILABLE",
            DEDUP_RETRY_MESSAGE,
            502,
          );
        }
      }

      sequence += 1;
      const selected = action === "CREATE" || action === "MERGE";
      proposalRows.push({
        sessionId,
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

    const summary = buildSummary(proposalRows, clarifications);
    const assistantText = [
      `حللت المعلومات ووجدت ${summary.total} معلومة.`,
      `${summary.create} معلومات جديدة`,
      `${summary.merge} تحديثات لمعلومات موجودة`,
      `${summary.noop} موجودة بالفعل`,
      `${summary.conflict} تحتاج مراجعة`,
    ].join("\n");

    const conversation: ConversationTurn[] = [
      ...workingConversation,
      { role: "assistant", text: assistantText, at: new Date().toISOString() },
    ];

    failurePhase = "finalize";
    const finalized = await finalizeAnalysis({
      businessId: params.businessId,
      userId: params.userId,
      sessionId,
      analysisVersion,
      conversation,
      summary,
      model: provider.model,
      proposalRows,
    });

    structuredLog("knowledge-ai", "knowledge_ingest.analyzed", {
      businessId: params.businessId,
      sessionId,
      inputLength: text.length,
      factCount: summary.total,
      createCount: summary.create,
      mergeCount: summary.merge,
      noopCount: summary.noop,
      conflictCount: summary.conflict,
      latencyMs: Date.now() - started,
      model: provider.model,
    });

    return finalized;
  } catch (error) {
    const mapped = friendlyProviderMessage(error);
    const providerCode =
      error instanceof AiProviderError
        ? error.code
        : error instanceof KnowledgeIngestError
          ? error.code
          : null;
    if (sessionId && analysisVersion > 0) {
      await markAnalysisFailed({
        businessId: params.businessId,
        sessionId,
        analysisVersion,
        errorCode: mapped.code,
      });
    }
    structuredLog("knowledge-ai", "knowledge_ingest.analyze_failed", {
      businessId: params.businessId,
      sessionId,
      errorCode: mapped.code,
      providerCode,
      phase: failurePhase,
      latencyMs: Date.now() - started,
      model: provider.model,
      inputLength: text.length,
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

export async function cancelIngestSession(params: {
  businessId: string;
  sessionId: string;
}): Promise<KnowledgeIngestSession> {
  return withTransaction(async (trx) => {
    const locked = await repo.lockSession(params, trx);
    if (!locked) {
      throw new KnowledgeIngestError(
        "SESSION_NOT_FOUND",
        "الجلسة غير موجودة.",
        404,
      );
    }
    if (locked.status === "APPLIED") {
      throw new KnowledgeIngestError(
        "SESSION_APPLIED",
        "تم اعتماد هذه الجلسة مسبقاً.",
      );
    }
    await repo.updateSession(
      {
        businessId: params.businessId,
        sessionId: params.sessionId,
        status: "CANCELED",
        clearRawInput: true,
        clearConversation: true,
      },
      trx,
    );
    const session = await repo.getSession(params, trx);
    return session!;
  });
}

/** Test helper — unique temp ids */
export function newTempId(): string {
  return randomUUID().slice(0, 8);
}
