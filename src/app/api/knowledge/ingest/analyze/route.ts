import { z } from "zod";

import { requireApiBusiness } from "@/lib/api/auth-context";
import { handleApiError, jsonOk, parseJsonBody } from "@/lib/api/http";
import {
  RATE_LIMITS,
  assertRateLimit,
} from "@/lib/security/rate-limit";
import {
  analyzeKnowledgeIngest,
  getIngestSessionView,
  KNOWLEDGE_INGEST_INPUT_MAX,
} from "@/modules/knowledge-ai";
import { createMockKnowledgeProvider } from "@/modules/knowledge-ai/mock-provider";

const analyzeSchema = z.object({
  text: z.string().min(1).max(KNOWLEDGE_INGEST_INPUT_MAX),
  sessionId: z.string().uuid().optional().nullable(),
});

export async function POST(request: Request) {
  try {
    const { user, businessId } = await requireApiBusiness();
    assertRateLimit(
      `knowledge-ingest:${businessId}`,
      RATE_LIMITS.knowledgeIngestAnalyze,
    );
    const body = await parseJsonBody(request);
    const input = analyzeSchema.parse(body);
    const useMock =
      process.env.E2E_KNOWLEDGE_INGEST_MOCK === "1"
      || process.env.KNOWLEDGE_INGEST_MOCK === "1";
    const result = await analyzeKnowledgeIngest({
      businessId,
      userId: user.userId,
      text: input.text,
      sessionId: input.sessionId,
      provider: useMock ? createMockKnowledgeProvider() : undefined,
      useHeuristicDedup:
        useMock || process.env.KNOWLEDGE_INGEST_HEURISTIC_DEDUP === "1",
    });
    return jsonOk({
      session: serializeSession(result.session),
      proposals: result.proposals.map(serializeProposal),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function GET(request: Request) {
  try {
    const { businessId } = await requireApiBusiness();
    const url = new URL(request.url);
    const sessionId = url.searchParams.get("sessionId");
    if (!sessionId) {
      return jsonOk({ session: null, proposals: [] });
    }
    const result = await getIngestSessionView({ businessId, sessionId });
    return jsonOk({
      session: serializeSession(result.session),
      proposals: result.proposals.map(serializeProposal),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

function serializeSession(session: {
  sessionId: string;
  status: string;
  conversation: unknown;
  summary: unknown;
  inputLength: number;
  model: string | null;
  errorCode: string | null;
  createdAtUtc: Date;
  updatedAtUtc: Date;
  appliedAtUtc: Date | null;
}) {
  return {
    sessionId: session.sessionId,
    status: session.status,
    conversation: session.conversation,
    summary: session.summary,
    inputLength: session.inputLength,
    model: session.model,
    errorCode: session.errorCode,
    createdAtUtc: session.createdAtUtc,
    updatedAtUtc: session.updatedAtUtc,
    appliedAtUtc: session.appliedAtUtc,
  };
}

function serializeProposal(p: {
  proposalId: string;
  sequence: number;
  action: string;
  category: string;
  proposedTitle: string;
  proposedContent: string;
  existingKnowledgeItemId: string | null;
  existingTitle: string | null;
  existingContent: string | null;
  resolution: string | null;
  selected: boolean;
  status: string;
}) {
  return {
    proposalId: p.proposalId,
    sequence: p.sequence,
    action: p.action,
    category: p.category,
    proposedTitle: p.proposedTitle,
    proposedContent: p.proposedContent,
    existingKnowledgeItemId: p.existingKnowledgeItemId,
    existingTitle: p.existingTitle,
    existingContent: p.existingContent,
    resolution: p.resolution,
    selected: p.selected,
    status: p.status,
  };
}
