import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { OnboardingChatBrand } from "@/components/onboarding/onboarding-chat-brand";

describe("onboarding chat brand visibility", () => {
  it("keeps mobile breakpoints on the wrapper, not on the themed logo images", () => {
    const html = renderToStaticMarkup(<OnboardingChatBrand />);

    expect(html).toContain('data-testid="onboarding-chat-brand"');
    expect(html).toMatch(/<span[^>]*class="[^"]*hidden[^"]*sm:inline-flex/);

    const images = [...html.matchAll(/<img\b[^>]*>/g)].map(([tag]) => tag);
    expect(images).toHaveLength(2);
    expect(images[0]).toContain("dark:hidden");
    expect(images[1]).toContain("dark:block");

    for (const img of images) {
      expect(img).not.toContain("sm:block");
      expect(img).not.toContain("sm:inline-flex");
    }
  });
});
