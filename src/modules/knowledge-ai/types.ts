import type { KnowledgeCategory } from "@/constants/knowledge";

import type {
  IngestAction,
  IngestProposalStatus,
  IngestResolution,
  IngestSessionStatus,
} from "./constants";

export type ConversationTurn = {
  role: "user" | "assistant";
  text: string;
  at: string;
};

export type ExtractedFact = {
  tempId: string;
  category: KnowledgeCategory;
  title: string;
  content: string;
  subject: string;
  aliases?: string[];
  urls?: string[];
  confidence?: number;
};

export type KnowledgeIngestSession = {
  sessionId: string;
  businessId: string;
  createdByUserId: string;
  status: IngestSessionStatus;
  rawInput: string | null;
  conversation: ConversationTurn[];
  inputHash: string | null;
  inputLength: number;
  model: string | null;
  summary: IngestSummary | null;
  errorCode: string | null;
  analysisVersion: number;
  createdAtUtc: Date;
  updatedAtUtc: Date;
  appliedAtUtc: Date | null;
};

export type IngestSummary = {
  total: number;
  create: number;
  merge: number;
  noop: number;
  conflict: number;
  clarifications: string[];
};

export type KnowledgeIngestProposal = {
  proposalId: string;
  sessionId: string;
  sequence: number;
  action: IngestAction;
  category: KnowledgeCategory;
  proposedTitle: string;
  proposedContent: string;
  existingKnowledgeItemId: string | null;
  existingTitle: string | null;
  existingContent: string | null;
  existingUpdatedAtUtc: Date | null;
  confidence: number | null;
  resolution: IngestResolution | null;
  selected: boolean;
  status: IngestProposalStatus;
  subjectKey: string | null;
  createdAtUtc: Date;
  updatedAtUtc: Date;
};

export type CandidateAlias = {
  alias: string;
  knowledgeItemId: string;
  category: KnowledgeCategory;
  title: string;
  content: string;
  updatedAtUtc: Date;
};

export type DedupDecision = {
  action: IngestAction;
  candidateAlias: string | null;
  proposedTitle: string;
  proposedContent: string;
  reason?: string;
};
