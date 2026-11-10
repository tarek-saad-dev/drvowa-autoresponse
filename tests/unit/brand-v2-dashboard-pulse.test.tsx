import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AppIcon, type AppIconName } from "@/components/ui/app-icon";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const home = read("src/app/(app)/dashboard/page.tsx");
const topbar = read("src/components/dashboard/topbar.tsx");
const sidebar = read("src/components/dashboard/sidebar.tsx");
const dashboard = read("src/components/dashboard/dashboard-shell.tsx");
const pulse = read("src/components/dashboard/pulse/pulse-overview.tsx");
const summary = read("src/components/dashboard/pulse/pulse-summary-chat.tsx");
const review = read("src/components/dashboard/pulse/review-center.tsx");
const reviewPopup = read("src/components/dashboard/pulse/review-chat-popup.tsx");
const ownership = read("src/components/dashboard/pulse/live-ownership.tsx");
const health = read("src/components/dashboard/overview/connection-health-strip.tsx");

describe("Brand V2 dashboard and Pulse presentation contract", () => {
  it("retains month as default and three accessible periods", () => {
    expect(home).toContain(':"month"');
    expect(pulse).toContain('["today","yesterday","month"] as const');
    expect(pulse).toContain('aria-current={period===choice?"page":undefined}');
    expect(pulse).toContain('href={periodHref(choice)}');
    expect(pulse).toContain('?"ملخص اليوم":choice==="yesterday"?"أمس":"ملخص الشهر"');
  });

  it("never substitutes made-up values for missing Pulse data", () => {
    expect(pulse).toContain('data?.conversations??"—"');
    expect(pulse).toContain('data?.aiConversations??"—"');
    expect(pulse).toContain('data?actionable:"—"');
    expect(pulse).toContain('needsAttention=attention&&typeof value==="number"&&value>0');
    expect(pulse).toContain('needsAttention?" text-warning":""');
  });

  it("preserves ownership, follow-up, AI plan and monitoring data flows", () => {
    expect(home).toContain("getPulseSnapshot({businessId,timezone:business.timezone,period,maxReviews:100})");
    expect(home).toContain("getHumanOwnershipSnapshot(businessId)");
    expect(home).toContain("deriveHomeBillingAlert");
    expect(home).toContain("getReceptionistOperationalHealth");
    expect(home).toContain('<LiveOwnership initial={ownership} businessId={businessId}/>');
    expect(review).toContain("onHandled={markHandled}");
    expect(review).toContain("onResolved={markHandled}");
    expect(ownership).toContain("/api/pulse/ownership?businessId=");
    expect(reviewPopup).toContain('"/dashboard/inbox?conversationId="');
  });

  it("uses semantic shadow and warning tokens rather than fixed cyan/teal decorations", () => {
    for (const file of [home, pulse, summary, review, ownership, health, reviewPopup]) {
      expect(file).not.toMatch(/rgba\(5,\s*(?:43|50),\s*(?:58|69)/i);
      expect(file).not.toMatch(/#(?:00759a|0b8bb5|38c6ed|3de7ff)\b/i);
    }
    expect(ownership).toContain("bg-warning-soft text-warning");
    expect(pulse).toContain('needsAttention?" border-warning/40":""');
  });

  it("keeps mobile inbox full height and hides nav when a conversation is open", () => {
    expect(dashboard).toContain("const showMobileNav = !isInbox || !threadOpen");
    expect(dashboard).toContain('fixed inset-0 z-40 flex h-[100dvh]');
    expect(dashboard).toContain('{mobileNav}');
  });

  it("keeps user account and logout discoverable, including focus and loading", () => {
    expect(sidebar).toContain("avatarInitial");
    expect(sidebar).toContain("displayPlan");
    expect(sidebar).toContain('href="/dashboard/settings?tab=account"');
    expect(sidebar).toContain('aria-current={active ? "page" : undefined}');
    expect(topbar).toContain('href="/dashboard/settings?tab=account"');
    expect(topbar).toContain('<AppIcon name="user"');
    expect(topbar).toContain('<AppIcon name="log-out"');
    expect(topbar).toContain('aria-label="تسجيل الخروج"');
    expect(topbar).toContain("loading={loggingOut}");
  });

  it.each(["user", "log-out"] as AppIconName[])("renders %s icon as a decorative SVG", (name) => {
    const html = renderToStaticMarkup(createElement(AppIcon, { name, className: "h-5 w-5" }));
    expect(html).toContain("<svg");
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain("h-5 w-5");
  });

  it("keeps summary in a bottom support-chat launcher instead of a large top card", () => {
    expect(summary).toContain('aria-controls="pulse-summary-chat-panel"');
    expect(summary).toContain('aria-modal="false"');
    expect(summary).toContain("getPulseSummaryCopy(data, period)");
    expect(summary).toContain("copy.coverage");
    expect(summary).toContain("fixed bottom-");
    expect(summary).toContain("shadow-md");
  });
});
