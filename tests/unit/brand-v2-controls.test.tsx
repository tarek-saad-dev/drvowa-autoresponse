import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Accordion } from "@/components/ui/accordion";
import { Alert } from "@/components/ui/alert";

describe("Brand V2 shared controls contract", () => {
  it("uses semantic primary contrast and visible keyboard focus for buttons", () => {
    const html = renderToStaticMarkup(
      createElement(Button, { variant: "primary", children: "حفظ" }),
    );
    expect(html).toContain("bg-primary");
    expect(html).toContain("text-primary-foreground");
    expect(html).toContain("focus-visible:outline-ring");
    expect(html).toContain('type="button"');
    expect(html).toContain("حفظ");
  });

  it("keeps danger as a separate semantic button variant", () => {
    const html = renderToStaticMarkup(
      createElement(Button, { variant: "danger", children: "حذف" }),
    );
    expect(html).toContain("bg-destructive");
    expect(html).toContain("text-destructive-foreground");
    expect(html).not.toContain("bg-primary ");
  });

  it("sets disabled and aria-busy on a loading button while preserving its label", () => {
    const html = renderToStaticMarkup(
      createElement(Button, { loading: true, children: "جارٍ الحفظ" }),
    );
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("disabled");
    expect(html).toContain("animate-spin");
    expect(html).toContain("جارٍ الحفظ");
  });

  it("uses one consistent accessible treatment for input, textarea and select", () => {
    const rendered = [
      renderToStaticMarkup(createElement(Input, { "aria-invalid": true, placeholder: "الاسم" })),
      renderToStaticMarkup(createElement(Textarea, { "aria-invalid": true, placeholder: "الرسالة" })),
      renderToStaticMarkup(createElement(Select, {
        "aria-invalid": true,
        children: createElement("option", { value: "x", children: "X" }),
      })),
    ];
    for (const html of rendered) {
      expect(html).toContain("border-input");
      expect(html).toContain("bg-card");
      expect(html).toContain("focus-visible:ring-ring/25");
      expect(html).toContain("aria-invalid:border-destructive");
      expect(html).toContain("motion-reduce:transition-none");
      expect(html).toContain('aria-invalid="true"');
    }
  });

  it("announces errors urgently but treats ordinary information as a polite status", () => {
    const info = renderToStaticMarkup(createElement(Alert, { variant: "info", children: "معلومات" }));
    const danger = renderToStaticMarkup(createElement(Alert, { variant: "error", children: "حدث خطأ" }));
    expect(info).toContain('role="status"');
    expect(info).toContain("bg-info-soft");
    expect(danger).toContain('role="alert"');
    expect(danger).toContain("bg-destructive-soft");
  });

  it("renders accordion headers as native buttons with announced state", () => {
    const html = renderToStaticMarkup(createElement(Accordion, {
      items: [{
        id: "one",
        title: "كيف أبدأ؟",
        summary: "تفاصيل البداية",
        children: createElement("p", { children: "شرح إضافي" }),
      }],
      defaultOpenId: "one",
    }));
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain("focus-visible:ring-ring");
    expect(html).toContain("كيف أبدأ؟");
    expect(html).toContain("شرح إضافي");
  });
});
