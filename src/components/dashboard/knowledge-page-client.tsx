"use client";

import { useState } from "react";

import { KnowledgeCopilot } from "@/components/dashboard/knowledge-copilot";
import { KnowledgeManager } from "@/components/dashboard/knowledge-manager";
import { Button } from "@/components/ui/button";
import type { KnowledgeItem } from "@/types/domain";

export function KnowledgePageClient({
  items,
  activeCount,
  activeLimit,
}: {
  items: KnowledgeItem[];
  activeCount: number;
  activeLimit: number | null;
}) {
  const [mode, setMode] = useState<"ai" | "manual">("ai");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant={mode === "ai" ? "primary" : "outline"}
          onClick={() => setMode("ai")}
        >
          إضافة بالذكاء
        </Button>
        <Button
          type="button"
          size="sm"
          variant={mode === "manual" ? "primary" : "outline"}
          onClick={() => setMode("manual")}
        >
          إضافة يدويًا
        </Button>
      </div>

      {mode === "ai" ? (
        <KnowledgeCopilot />
      ) : (
        <KnowledgeManager
          items={items}
          activeCount={activeCount}
          activeLimit={activeLimit}
        />
      )}
    </div>
  );
}
