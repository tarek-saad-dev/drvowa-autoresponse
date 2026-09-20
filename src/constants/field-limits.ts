/** Shared V1 field limits — keep prompts and DB writes bounded. */

export const AGENT_NAME_MAX = 120;
export const AGENT_ROLE_MAX = 120;
export const AGENT_LANGUAGE_MAX = 32;
export const AGENT_DIALECT_MAX = 64;
export const AGENT_TONE_MAX = 120;
/** Soft cap injected into Gemini system prompt; API rejects above this. */
export const AGENT_INSTRUCTIONS_MAX = 8_000;

export const KNOWLEDGE_TITLE_MAX = 300;
export const KNOWLEDGE_CONTENT_MAX = 20_000;
