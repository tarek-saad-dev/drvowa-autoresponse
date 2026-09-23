export {
  analyzeKnowledgeIngest,
  cancelIngestSession,
  extractAllFacts,
  extractChunkAdaptive,
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
export {
  coerceExtractionPayload,
  createGeminiKnowledgeProvider,
} from "./gemini-knowledge-provider";
export {
  DEDUP_DECISION_SCHEMA,
  EXTRACTION_RESPONSE_SCHEMA,
} from "./gemini-response-schemas";
export { heuristicResolveDedup } from "./resolve-dedup";
export { dedupeExtractedFacts, mergeContents } from "./normalize";
export { chunkText, splitDenseChunk } from "./chunk";
export { findCandidatesForFact, buildCandidatesByFact } from "./candidate-retrieval";
