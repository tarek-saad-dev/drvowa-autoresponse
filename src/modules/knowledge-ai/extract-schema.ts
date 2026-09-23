import { z } from "zod";

import { ALL_KNOWLEDGE_CATEGORIES } from "@/constants/knowledge";

export const extractedFactSchema = z.object({
  tempId: z.string().min(1).max(64),
  category: z.enum(
    ALL_KNOWLEDGE_CATEGORIES as unknown as [
      (typeof ALL_KNOWLEDGE_CATEGORIES)[number],
      ...(typeof ALL_KNOWLEDGE_CATEGORIES)[number][],
    ],
  ),
  title: z.string().min(1).max(300),
  content: z.string().min(1).max(20_000),
  subject: z.string().min(1).max(200),
  aliases: z.array(z.string().max(120)).max(12).optional(),
  urls: z.array(z.string().max(2000)).max(20).optional(),
  confidence: z.number().min(0).max(1).optional(),
});

export const extractionResponseSchema = z.object({
  facts: z.array(extractedFactSchema).max(120),
  clarifications: z.array(z.string().max(500)).max(20).default([]),
});

export type ExtractionResponse = z.infer<typeof extractionResponseSchema>;

export const dedupDecisionSchema = z.object({
  decisions: z
    .array(
      z.object({
        tempId: z.string().min(1).max(64),
        action: z.enum(["CREATE", "MERGE", "NOOP", "CONFLICT"]),
        candidateAlias: z.string().max(16).nullable(),
        proposedTitle: z.string().min(1).max(300),
        proposedContent: z.string().min(1).max(20_000),
        reason: z.string().max(400).optional(),
      }),
    )
    .max(200),
});

export type DedupDecisionResponse = z.infer<typeof dedupDecisionSchema>;
