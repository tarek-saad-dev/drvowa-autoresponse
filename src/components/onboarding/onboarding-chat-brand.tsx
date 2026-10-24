import { BrandLogo } from "@/components/brand/brand-logo";

/**
 * Keep responsive visibility on a wrapper instead of forwarding "sm:block"
 * to BrandLogo, which renders one image for each theme. Forwarding display
 * utilities to both images can override the inactive theme's "hidden" class.
 */
export function OnboardingChatBrand() {
  return (
    <span className="hidden shrink-0 sm:inline-flex" data-testid="onboarding-chat-brand">
      <BrandLogo className="h-6 w-auto" priority />
    </span>
  );
}
