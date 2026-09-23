import { Type, type Schema } from "@google/genai";

import { ALL_KNOWLEDGE_CATEGORIES } from "@/constants/knowledge";

import { INGEST_ACTIONS } from "./constants";

/**
 * Gemini structured-output schema for extractFacts (mirrors Zod).
 * Note: do not set maxItems here — some Gemini models reject it with 400.
 * Server-side Zod still enforces array bounds.
 */
export const EXTRACTION_RESPONSE_SCHEMA: Schema = {
  type: Type.OBJECT,
  propertyOrdering: ["facts", "clarifications"],
  required: ["facts", "clarifications"],
  properties: {
    facts: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        propertyOrdering: [
          "tempId",
          "category",
          "title",
          "content",
          "subject",
          "aliases",
          "urls",
          "confidence",
        ],
        required: ["tempId", "category", "title", "content", "subject"],
        properties: {
          tempId: { type: Type.STRING },
          category: {
            type: Type.STRING,
            format: "enum",
            enum: [...ALL_KNOWLEDGE_CATEGORIES],
          },
          title: { type: Type.STRING },
          content: { type: Type.STRING },
          subject: { type: Type.STRING },
          aliases: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
          urls: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
          confidence: { type: Type.NUMBER },
        },
      },
    },
    clarifications: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
  },
};

/** Gemini structured-output schema for resolveDedup (mirrors Zod). */
export const DEDUP_DECISION_SCHEMA: Schema = {
  type: Type.OBJECT,
  propertyOrdering: ["decisions"],
  required: ["decisions"],
  properties: {
    decisions: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        propertyOrdering: [
          "tempId",
          "action",
          "candidateAlias",
          "proposedTitle",
          "proposedContent",
          "reason",
        ],
        required: [
          "tempId",
          "action",
          "candidateAlias",
          "proposedTitle",
          "proposedContent",
        ],
        properties: {
          tempId: { type: Type.STRING },
          action: {
            type: Type.STRING,
            format: "enum",
            enum: [...INGEST_ACTIONS],
          },
          candidateAlias: { type: Type.STRING, nullable: true },
          proposedTitle: { type: Type.STRING },
          proposedContent: { type: Type.STRING },
          reason: { type: Type.STRING },
        },
      },
    },
  },
};
