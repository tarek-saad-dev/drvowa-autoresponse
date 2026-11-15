import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const studio = readFileSync(
  resolve(process.cwd(), "src/components/dashboard/employee-studio.tsx"),
  "utf8",
);

describe("employee studio desktop UX layout contract", () => {
  it("replaces the cramped three-column desktop layout with a full-width editor and preview", () => {
    expect(studio).not.toContain("max-w-4xl");
    expect(studio).not.toContain("xl:grid-cols-[minmax(250px,300px)");
    expect(studio).toContain("lg:grid-cols-[minmax(0,1fr)_minmax(320px,390px)]");
    expect(studio).toContain("studio-saved-profile");
    expect(studio).toContain("معاينة المحادثة");
  });

  it("keeps exactly one active vertical scroller per viewport in personality mode", () => {
    const panel = studio.match(/<section role="tabpanel" id="studio-personality"[\s\S]*?<div role="tabpanel" id="studio-knowledge"/)?.[0];
    expect(panel).toBeTruthy();
    expect(panel).toContain("overflow-y-auto pb-4 [&[hidden]]:hidden lg:overflow-hidden");
    expect(panel).toContain("lg:overflow-y-auto lg:overscroll-contain");
    expect(panel).toContain("shrink-0 border-t border-border bg-card/95");
    expect(panel).not.toContain("lg:grid-cols-[minmax(250px,300px)");
  });

  it("allows switching mock preview language without changing the stored employee language", () => {
    expect(studio).toContain('useState<"ar" | "en">("ar")');
    expect(studio).toContain("multilingual ? previewDemoLanguage : draft.language");
    expect(studio).toContain('setPreviewDemoLanguage("ar")');
    expect(studio).toContain('setPreviewDemoLanguage("en")');
    expect(studio).toContain("مش رد مولّد من الـ AI");
  });

  it("keeps the saved-profile, save, and activation controls", () => {
    expect(studio).toContain("chooseProfile(e.target.value)");
    expect(studio).toContain("onClick={createNew}");
    expect(studio).toContain("void saveActiveAgent(chosen.agentId");
    expect(studio).toContain("void savePersonality()");
    expect(studio).toContain('id="studio-knowledge"');
  });
});
