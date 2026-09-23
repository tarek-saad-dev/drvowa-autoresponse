/** Knowledge AI ingestion constants (server-side). */

export const KNOWLEDGE_INGEST_INPUT_MAX = 60_000;
/** Total user-source characters across a multi-turn ingest session. */
export const KNOWLEDGE_INGEST_SESSION_SOURCE_MAX = 120_000;
export const KNOWLEDGE_INGEST_CHUNK_SIZE = 14_000;
export const KNOWLEDGE_INGEST_CHUNK_OVERLAP = 400;
export const KNOWLEDGE_INGEST_MAX_FACTS = 200;
export const KNOWLEDGE_INGEST_MAX_CANDIDATES = 8;
/** Same-category fallback when lexical score is weak (still bounded). */
export const KNOWLEDGE_INGEST_FALLBACK_CANDIDATES = 3;
export const KNOWLEDGE_INGEST_GEMINI_TIMEOUT_MS = 45_000;

export const INGEST_SESSION_STATUSES = [
  "DRAFT",
  "ANALYZING",
  "REVIEW",
  "APPLIED",
  "FAILED",
  "CANCELED",
] as const;

export type IngestSessionStatus = (typeof INGEST_SESSION_STATUSES)[number];

export const INGEST_ACTIONS = ["CREATE", "MERGE", "NOOP", "CONFLICT"] as const;
export type IngestAction = (typeof INGEST_ACTIONS)[number];

export const INGEST_RESOLUTIONS = [
  "USE_NEW",
  "KEEP_EXISTING",
  "MANUAL",
] as const;
export type IngestResolution = (typeof INGEST_RESOLUTIONS)[number];

export const INGEST_PROPOSAL_STATUSES = [
  "PENDING",
  "RESOLVED",
  "APPLIED",
  "SKIPPED",
  "STALE",
] as const;
export type IngestProposalStatus = (typeof INGEST_PROPOSAL_STATUSES)[number];
