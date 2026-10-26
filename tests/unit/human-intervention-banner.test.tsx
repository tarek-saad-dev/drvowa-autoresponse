import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { HumanInterventionBanner } from "@/components/dashboard/overview/human-intervention-banner";

describe("HumanInterventionBanner", () => {
  it("renders nothing when there are no open escalations", () => {
    const html = renderToStaticMarkup(
      createElement(HumanInterventionBanner, { count: 0 }),
    );
    expect(html).toBe("");
  });

  it("links to the human-attention inbox filter when escalations exist", () => {
    const html = renderToStaticMarkup(
      createElement(HumanInterventionBanner, { count: 2 }),
    );
    expect(html).toContain("في 2 عملاء محتاجين متابعتك");
    expect(html).toContain("/dashboard/inbox?filter=FOLLOW_UP");
    expect(html).toContain("راجع المحادثات");
  });
});
