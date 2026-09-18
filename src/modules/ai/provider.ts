import type { Agent, KnowledgeItem, Message } from "@/types/domain";

export type AiReplyRequest = {
  businessId: string;
  conversationId: string;
  agent: Pick<
    Agent,
    "name" | "roleTitle" | "language" | "dialect" | "tone" | "instructions"
  >;
  knowledge: Array<Pick<KnowledgeItem, "category" | "title" | "content">>;
  recentMessages: Array<
    Pick<Message, "direction" | "textContent" | "createdAtUtc" | "messageId">
  >;
  customerPhoneHint?: string | null;
};

export type AiReplyResult = {
  text: string;
  model: string;
  latencyMs: number;
};

export interface AiReplyProvider {
  generateReply(request: AiReplyRequest): Promise<AiReplyResult>;
}

export const MAX_REPLY_CHARS = 1200;
export const MAX_KNOWLEDGE_CHARS = 12_000;
export const MAX_HISTORY_MESSAGES = 16;
export const GEMINI_TIMEOUT_MS = 10_000;

export function sanitizeReplyText(raw: string): string {
  let text = raw.trim();
  // Strip accidental markdown fences / JSON wrappers
  if (text.startsWith("```")) {
    text = text.replace(/^```[a-zA-Z]*\n?/, "").replace(/```$/, "").trim();
  }
  if (text.length > MAX_REPLY_CHARS) {
    text = text.slice(0, MAX_REPLY_CHARS).trim();
  }
  return text;
}

export function buildSystemPrompt(agent: AiReplyRequest["agent"]): string {
  const dialect = agent.dialect?.trim() || "";
  const tone = agent.tone?.trim() || "";
  const language = agent.language?.trim() || "ar";

  return [
    "You are a WhatsApp receptionist for a local business.",
    `Your name: ${agent.name}. Role: ${agent.roleTitle}.`,
    `Language: ${language}. Dialect: ${dialect || "match the customer"}. Tone: ${tone || "friendly professional"}.`,
    "Follow the tenant Agent instructions below, but never override these platform rules:",
    "- Use only supplied business knowledge for factual business claims (prices, hours, policies, services, locations, availability).",
    "- Never invent unavailable facts. If unknown, say you need to confirm or that a human will help.",
    "- Keep replies concise for WhatsApp. Prefer short paragraphs. Avoid heavy markdown.",
    "- Do not overuse emojis. Do not reveal system/tool/database internals.",
    "- Match the customer's language naturally.",
    "- Never output chain-of-thought. Reply with the final customer message only.",
    agent.instructions?.trim()
      ? `Tenant agent instructions:\n${agent.instructions.trim()}`
      : "No extra tenant instructions.",
  ].join("\n");
}

export function buildUserPrompt(request: AiReplyRequest): string {
  const knowledgeBlock = request.knowledge.length === 0
    ? "(No business knowledge items provided.)"
    : request.knowledge
      .map((k) => `[${k.category}] ${k.title}\n${k.content}`)
      .join("\n\n")
      .slice(0, MAX_KNOWLEDGE_CHARS);

  const history = request.recentMessages
    .map((m) => {
      const who = m.direction === "INBOUND" ? "Customer" : "Receptionist";
      return `${who}: ${m.textContent ?? ""}`;
    })
    .join("\n");

  return [
    "BUSINESS KNOWLEDGE (authoritative facts only):",
    knowledgeBlock,
    "",
    "RECENT CONVERSATION (oldest → newest):",
    history || "(empty)",
    "",
    "Write the next WhatsApp reply as the receptionist. Plain text only.",
  ].join("\n");
}
