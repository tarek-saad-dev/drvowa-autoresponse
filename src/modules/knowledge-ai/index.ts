export {
  analyzeKnowledgeIngest,
  cancelIngestSession,
  getIngestSessionView,
  KnowledgeIngestError,
  resolveDedupSafely,
} from "./analyze-service";
export {
  applyKnowledgeIngest,
  updateProposalSelection,
} from "./apply-service";
export {
  KNOWLEDGE_INGEST_INPUT_MAX,
  KNOWLEDGE_INGEST_SESSION_SOURCE_MAX,
  type IngestAction,
} from "./constants";
export { createGeminiKnowledgeProvider } from "./gemini-knowledge-provider";
export { heuristicResolveDedup } from "./resolve-dedup";
export { dedupeExtractedFacts, mergeContents } from "./normalize";
export { chunkText } from "./chunk";
export { findCandidatesForFact, buildCandidatesByFact } from "./candidate-retrieval";
