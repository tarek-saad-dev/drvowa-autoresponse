import { describe, expect, it, vi } from "vitest";

import {
  extractAllFacts,
  extractChunkAdaptive,
  KnowledgeIngestError,
} from "@/modules/knowledge-ai/analyze-service";
import { splitDenseChunk, chunkText } from "@/modules/knowledge-ai/chunk";
import { AiProviderError } from "@/modules/ai/gemini-provider";
import type { KnowledgeExtractProvider } from "@/modules/knowledge-ai/gemini-knowledge-provider";
import { KNOWLEDGE_INGEST_ADAPTIVE_SPLIT_MAX_DEPTH } from "@/modules/knowledge-ai/constants";

function fact(id: string, title: string) {
  return {
    tempId: id,
    category: "CUSTOM" as const,
    title,
    content: `${title} content`,
    subject: title,
  };
}

describe("adaptive chunk split", () => {
  it("splitDenseChunk halves large text", () => {
    const text = `${"para A\n\n".repeat(200)}${"para B\n\n".repeat(200)}`;
    const parts = splitDenseChunk(text);
    expect(parts).not.toBeNull();
    expect(parts![0].length).toBeGreaterThan(1000);
    expect(parts![1].length).toBeGreaterThan(1000);
  });

  it("refuses to split tiny text", () => {
    expect(splitDenseChunk("short")).toBeNull();
  });

  it("dense chunk truncates → adaptive split → succeeds", async () => {
    let calls = 0;
    const provider: KnowledgeExtractProvider = {
      model: "mock",
      async extractFacts(input: string) {
        calls += 1;
        if (input.length > 4000) {
          throw new AiProviderError("trunc", "GEMINI_TRUNCATED");
        }
        return {
          facts: [fact(`id-${calls}`, `T${calls}`)],
          clarifications: [],
        };
      },
      async resolveDedup() {
        return { decisions: [] };
      },
    };

    const dense = "line\n\n".repeat(3000); // ~12k chars
    const result = await extractChunkAdaptive(provider, dense);
    expect(result.facts.length).toBeGreaterThanOrEqual(2);
    expect(calls).toBeGreaterThan(1);
  });

  it("retry bound prevents infinite adaptive loop", async () => {
    let calls = 0;
    const provider: KnowledgeExtractProvider = {
      model: "mock",
      async extractFacts() {
        calls += 1;
        throw new AiProviderError("trunc", "GEMINI_TRUNCATED");
      },
      async resolveDedup() {
        return { decisions: [] };
      },
    };
    const dense = "x\n\n".repeat(5000);
    await expect(extractChunkAdaptive(provider, dense)).rejects.toMatchObject({
      code: "GEMINI_TRUNCATED",
    });
    // depth 0..max → at most 2^(depth+1)-1 leaf attempts, but we fail before
    // exhausting when split can't help forever; hard cap on depth.
    expect(calls).toBeLessThanOrEqual(
      2 ** (KNOWLEDGE_INGEST_ADAPTIVE_SPLIT_MAX_DEPTH + 1),
    );
  });

  it("multi-chunk extraction collapses duplicate facts across splits", async () => {
    const provider: KnowledgeExtractProvider = {
      model: "mock",
      async extractFacts() {
        return {
          facts: [
            fact("a", "فرع جليم"),
            fact("b", "فرع جليم"),
          ],
          clarifications: [],
        };
      },
      async resolveDedup() {
        return { decisions: [] };
      },
    };
    const text = `${"A".repeat(15_000)}\n\n${"B".repeat(15_000)}`;
    expect(chunkText(text).length).toBeGreaterThan(1);
    const { facts } = await extractAllFacts(provider, text);
    expect(facts.length).toBe(1);
    expect(facts[0]?.tempId).toBe("F1");
  });
});

describe("extractChunkAdaptive non-truncation", () => {
  it("does not split on non-truncation errors", async () => {
    const provider: KnowledgeExtractProvider = {
      model: "mock",
      async extractFacts() {
        throw new AiProviderError("schema", "GEMINI_SCHEMA_MISMATCH");
      },
      async resolveDedup() {
        return { decisions: [] };
      },
    };
    await expect(
      extractChunkAdaptive(provider, "x".repeat(10_000)),
    ).rejects.toMatchObject({ code: "GEMINI_SCHEMA_MISMATCH" });
  });

  it("maps too many facts", async () => {
    const provider: KnowledgeExtractProvider = {
      model: "mock",
      async extractFacts() {
        return {
          facts: Array.from({ length: 220 }, (_, i) =>
            fact(`f${i}`, `Subject ${i}`),
          ),
          clarifications: [],
        };
      },
      async resolveDedup() {
        return { decisions: [] };
      },
    };
    await expect(extractAllFacts(provider, "hello world long enough")).rejects.toBeInstanceOf(
      KnowledgeIngestError,
    );
    await expect(extractAllFacts(provider, "hello world long enough")).rejects.toMatchObject({
      code: "TOO_MANY_FACTS",
    });
  });
});

describe("log safety smoke", () => {
  it("structured adaptive_split log has no raw content keys", async () => {
    const lines: string[] = [];
    const spy = vi.spyOn(console, "info").mockImplementation((msg: unknown) => {
      lines.push(String(msg));
    });
    let sawLarge = false;
    const provider: KnowledgeExtractProvider = {
      model: "mock",
      async extractFacts(input: string) {
        // Truncate once on the original large chunk, then succeed on halves.
        if (!sawLarge && input.length > 8_000) {
          sawLarge = true;
          throw new AiProviderError("trunc", "GEMINI_TRUNCATED");
        }
        return { facts: [fact("1", "ok")], clarifications: [] };
      },
      async resolveDedup() {
        return { decisions: [] };
      },
    };
    await extractChunkAdaptive(
      provider,
      "SECRET_PASTE_CONTENT\n\n".repeat(2000),
    );
    spy.mockRestore();
    const joined = lines.join("\n");
    expect(joined).not.toContain("SECRET_PASTE_CONTENT");
    expect(joined).toContain("adaptive_split");
  });
});
