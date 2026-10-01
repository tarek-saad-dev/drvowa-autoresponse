import { redirect } from "next/navigation";

import { GuidedOnboardingPreview } from "@/components/onboarding/guided-preview";

export default function GuidedOnboardingPreviewPage() {
  if (process.env.NODE_ENV === "production") {
    redirect("/onboarding");
  }
  return <GuidedOnboardingPreview />;
}
