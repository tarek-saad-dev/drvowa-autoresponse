import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { EmptyState } from "@/components/ui/empty-state";
import { DrvoLoading } from "@/components/ui/drvo-loading";
import { AppIcon, type AppIconName } from "@/components/ui/app-icon";

describe("Brand V2 visual primitives contract", () => {
  it("keeps cards modular with consistent semantic surfaces", () => {
    const html = renderToStaticMarkup(createElement(Card, {
      children: [
        createElement(CardHeader, { key: "header", children: createElement(CardTitle, { children: "الاشتراك" }) }),
        createElement(CardContent, { key: "content", children: "تفاصيل الباقة" }),
      ],
    }));
    expect(html).toContain("rounded-2xl");
    expect(html).toContain("border-border");
    expect(html).toContain("bg-card");
    expect(html).toContain("الاشتراك");
    expect(html).toContain("تفاصيل الباقة");
  });

  it.each([
    ["success", "bg-success-soft text-success"],
    ["warning", "bg-warning-soft text-warning"],
    ["info", "bg-info-soft text-info"],
    ["muted", "bg-surface text-muted-foreground"],
  ] as const)("retains distinct %s semantic badge feedback", (variant, classFragment) => {
    const html = renderToStaticMarkup(createElement(Badge, { variant, children: "حالة" }));
    expect(html).toContain(classFragment);
    expect(html).toContain("حالة");
  });

  it("shows warning for near-limit progress instead of branding it as success", () => {
    const html = renderToStaticMarkup(createElement(Progress, {
      value: 90,
      max: 100,
      label: "الاستخدام",
    }));
    expect(html).toContain('aria-valuenow="90"');
    expect(html).toContain('aria-valuemax="100"');
    expect(html).toContain("bg-warning");
    expect(html).toContain("width:90%");
  });

  it("gives unlimited/invalid progress a meaningful label without NaN values", () => {
    const html = renderToStaticMarkup(createElement(Progress, {
      value: Number.NaN,
      max: Number.POSITIVE_INFINITY,
      label: "الاستخدام",
    }));
    expect(html).toContain("بلا حد");
    expect(html).toContain("aria-valuetext");
    expect(html).not.toContain("NaN");
    expect(html).not.toContain('aria-valuenow=');
    expect(html).not.toContain('width:NaN%');
  });

  it("keeps an accessible action inside the empty state without changing its semantics", () => {
    const html = renderToStaticMarkup(createElement(EmptyState, {
      title: "لا توجد محادثات",
      description: "ابدأ من هنا",
      action: createElement("a", { href: "/dashboard", children: "الرئيسية" }),
    }));
    expect(html).toContain("border-dashed");
    expect(html).toContain("لا توجد محادثات");
    expect(html).toContain('href="/dashboard"');
  });

  it("keeps the app chrome available during route loading", () => {
    const html = renderToStaticMarkup(createElement(DrvoLoading, {
      variant: "inline",
      label: "بيجهز",
    }));
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("shadow-md");
    expect(html).not.toContain("rgba(0,117,154");
    expect(html).toContain("بيجهز");
  });

  it.each([
    "home", "inbox", "employee", "settings", "billing", "integrations",
    "admin", "chevron", "sun", "moon",
  ] as AppIconName[])("renders decorative %s icon consistently as SVG", (name) => {
    const html = renderToStaticMarkup(createElement(AppIcon, { name, className: "h-5 w-5" }));
    expect(html).toContain("<svg");
    expect(html).toContain('viewBox="0 0 24 24"');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('stroke="currentColor"');
    expect(html).toContain("h-5 w-5");
  });
});
