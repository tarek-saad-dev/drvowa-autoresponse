import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const studio = source("src/components/dashboard/employee-studio.tsx");
const page = source("src/app/(app)/dashboard/agent/page.tsx");

describe("Agent WhatsApp Campaigns coming-soon tab", () => {
  it("renders an accessible disabled gray tab with a visible soon label", () => {
    const button = studio.match(/<button type="button" role="tab" disabled[\s\S]*?<\/button>/)?.[0];
    expect(button).toBeTruthy();
    expect(button).toContain('aria-disabled="true"');
    expect(button).toContain('aria-selected={false}');
    expect(button).toContain('aria-label="حملات واتساب - قريبًا"');
    expect(button).toContain("حملات واتساب");
    expect(button).toContain("قريبًا");
    expect(button).toContain("cursor-not-allowed");
    expect(button).toContain("bg-muted/40");
    expect(button).not.toContain("onClick");
    expect(button).not.toContain("href=");
  });

  it("does not mount or import the campaign feature in Agent", () => {
    expect(studio).not.toContain("LabelCampaignChat");
    expect(studio).not.toContain('setTab("campaigns")');
    expect(studio).not.toContain('id="studio-campaigns"');
    expect(studio).not.toContain('role="tabpanel" id="studio-campaigns"');
    expect(studio).toContain('initialTab?: "personality" | "knowledge";');
  });

  it("rejects the old campaigns query tab by falling back to personality", () => {
    expect(page).toContain('initialTab={tab === "knowledge" ? "knowledge" : "personality"}');
    expect(page).not.toContain('tab === "campaigns"');
    expect(page).toContain('canManageCampaigns={membership?.status === "ACTIVE" && membership.role === "OWNER"}');
  });
});
