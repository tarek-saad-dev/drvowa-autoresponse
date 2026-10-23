import { redirect } from "next/navigation";

import { GuidedOnboardingPreview } from "@/components/onboarding/guided-preview";
import { AuthError } from "@/lib/tenancy/errors";
import { requireAuthenticatedUser } from "@/lib/tenancy/require-user";
import { listBusinessesForUser } from "@/modules/businesses/service";

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string }>;
}) {
  const { plan } = await searchParams;
  const selectedPlan = ["STARTER", "PRO", "BUSINESS"].includes(plan ?? "")
    ? plan
    : null;

  let user;
  try {
    user = await requireAuthenticatedUser();
  } catch (error) {
    if (error instanceof AuthError) {
      redirect("/login");
    }
    throw error;
  }

  // Completed workspaces skip onboarding; partial drafts resume normally.
  const businesses = await listBusinessesForUser(user.userId);
  const completed = businesses.some((business) => business.onboardingCompletedAtUtc);
  if (completed) {
    redirect("/dashboard");
  }

  return (
    <GuidedOnboardingPreview
      storageKey={`drvowa_guided_onboarding_draft_v4_${user.userId}`}
      selectedPlan={selectedPlan}
    />
  );
}
