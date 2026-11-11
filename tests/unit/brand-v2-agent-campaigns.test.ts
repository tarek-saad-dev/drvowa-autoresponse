import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string): string => readFileSync(resolve(process.cwd(), path), "utf8");

const agent = source("src/components/dashboard/agent-workspace.tsx");
const agentSettings = source("src/components/dashboard/ai-auto-reply-panel.tsx");
const characters = source("src/components/dashboard/agents-manager.tsx");
const whatsapp = source("src/components/dashboard/whatsapp-panel.tsx");
const knowledge = source("src/components/dashboard/knowledge-page-client.tsx");
const conversation = source("src/components/dashboard/employee-knowledge-chat.tsx");
const copilot = source("src/components/dashboard/knowledge-copilot.tsx");
const campaign = source("src/components/dashboard/label-campaign-chat.tsx");
const launch = source("src/components/dashboard/label-campaign-launch.tsx");
const preflight = source("src/components/dashboard/label-campaign-preflight.tsx");
const audience = source("src/components/dashboard/label-campaign-audience-preview.tsx");
const picker = source("src/components/dashboard/campaign-label-picker.tsx");
const localLists = source("src/components/dashboard/campaign-local-list-manager.tsx");

describe("Brand V2 agent, knowledge and campaigns UI contract", () => {
  it("uses a calm shared editorial text hierarchy instead of competing black headings", () => {
    for (const file of [
      agent, agentSettings, characters, whatsapp, knowledge, conversation, copilot,
      campaign, launch, preflight, audience, picker, localLists,
    ]) {
      expect(file).not.toContain("font-black");
      expect(file).not.toMatch(/#(?:00759a|0b8bb5|38c6ed|3de7ff)\b/i);
    }
    expect(agent).toContain("font-display text-2xl font-bold");
    expect(knowledge).toContain("font-display text-2xl font-bold");
    expect(campaign).toContain("font-display text-lg font-bold");
  });

  it("shows real agent readiness only when WhatsApp is ready and the employee is enabled", () => {
    expect(agent).toContain("enabled && waReady");
    expect(agent).toContain("!canEnable");
    expect(agent).toContain("whatsappStatusLabel");
    expect(agent).toContain("TAKEOVER_OPTIONS");
    expect(agent).toContain("onClick={() => void save(false)}");
    expect(agentSettings).toContain('aria-pressed={selected}');
  });

  it("keeps knowledge training a chat, not an automatic silent save", () => {
    expect(conversation).toContain('role="log"');
    expect(conversation).toContain('aria-label="رسائل تعليم الموظف"');
    expect(conversation).toContain("unresolved");
    expect(conversation).toContain("updateConflict(");
    expect(conversation).toContain("applyChanges()");
    expect(conversation).toContain("motion-reduce:animate-none");
    expect(conversation).toContain("focus-visible:outline-ring");
  });

  it("protects manual review and explicit approval of extracted knowledge", () => {
    expect(copilot).toContain("selectedCount === 0");
    expect(copilot).toContain("onClick={applySelected}");
    expect(copilot).toContain("isConflict");
    expect(copilot).toContain("bg-warning-soft text-warning");
    expect(copilot).toContain("shadow-md");
  });

  it("keeps knowledge mode choice discoverable and usable with keyboard", () => {
    expect(knowledge).toContain('setMode("ai")');
    expect(knowledge).toContain('setMode("manual")');
    expect(knowledge).toContain("focus-visible:outline-ring");
    expect(knowledge).toContain("motion-reduce:transition-none");
  });

  it("keeps campaign copy approval separate from delivery launch", () => {
    expect(campaign).toContain("اعتماد النص لا يبدأ الإرسال");
    expect(campaign).toContain("COPY_APPROVED");
    expect(campaign).toContain("LabelCampaignPreflight");
    expect(campaign).toContain('aria-label="مراحل تحضير الحملة"');
    expect(campaign).toContain('aria-current={step.active ? "step" : undefined}');
    expect(campaign).toContain("focus-visible:ring-ring/25");
  });

  it("preserves server-gated preflight, audience and owner launch confirmation", () => {
    expect(campaign).toContain("sendingEnabled !== false");
    expect(preflight).toContain("data.sendingEnabled !== false");
    expect(audience).toContain("data.audience.sendingEnabled !== false");
    expect(launch).toContain("if(!preview?.canLaunch||busy||!confirm)return;");
    expect(launch).toContain("disabled={!preview.canLaunch || busy}");
    expect(launch).toContain('method:"POST"');
    expect(launch).toContain("expectedEligible:preview.eligible");
    expect(launch).toContain("expectedMessage:messageText");
    expect(launch).toContain("تأكيد بدء الإرسال");
  });

  it("does not show unknown or failed message results as successful", () => {
    expect(launch).toContain("preview.run.failed.toLocaleString");
    expect(launch).toContain("preview.run.unknown.toLocaleString");
    expect(launch).toContain("preview.run.status === \"COMPLETED\"");
    expect(launch).toContain("bg-warning-soft text-warning");
    expect(launch).toContain('role="alert"');
    expect(launch).toContain("مش هنعيدها تلقائيًا لمنع التكرار");
    expect(launch).toContain('method:"PATCH"');
  });

  it("preserves partial label mirror and source-dependent audience information", () => {
    expect(picker).toContain("EVENT_DRIVEN_PARTIAL");
    expect(picker).toContain("اختيار القائمة لا يرسل رسائل");
    expect(localLists).toContain("/test-recipient");
    expect(audience).toContain("البيانات جزئية");
    expect(audience).toContain("موافقة الاستلام التسويقي");
    expect(audience).toContain("maskedPhone");
  });

  it("keeps WhatsApp connection and AI handover state distinct and responsive", () => {
    expect(whatsapp).toContain('state === "QR_REQUIRED"');
    expect(whatsapp).toContain("inboundDegraded");
    expect(whatsapp).toContain("bg-warning-soft");
    expect(whatsapp).toContain("max-w-full rounded-xl bg-white");
    expect(agentSettings).toContain("humanTakeoverResumePolicy");
    expect(agentSettings).toContain("focus-visible:outline-ring");
    expect(agentSettings).toContain("bg-success-soft");
  });
});
