import { redirect } from "next/navigation";

import { GuidedOnboardingPreview } from "@/components/onboarding/guided-preview";
import { AuthError } from "@/lib/tenancy/errors";
import { requireAuthenticatedUser } from "@/lib/tenancy/require-user";

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ plan?: string }> }) {
  const { plan } = await searchParams;
  const selectedPlan = ["STARTER", "PRO", "BUSINESS"].includes(plan ?? "") ? plan : null;
  let user;
  try {
    user = await requireAuthenticatedUser();
  } catch (error) {
    if (error instanceof AuthError) {
      redirect("/login");
    }
    throw error;
  }

  return (
    <GuidedOnboardingPreview
      storageKey={`drvowa_guided_onboarding_draft_v1_${user.userId}`}
      selectedPlan={selectedPlan}
    />
  );
}
