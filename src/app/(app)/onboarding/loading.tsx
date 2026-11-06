import { DrvoLoading } from "@/components/ui/drvo-loading";

export default function OnboardingLoading() {
  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-background">
      <DrvoLoading
        label="بنجهّز موظفك الذكي…"
        hint="بنحضّر تجربة الإعداد الأولى."
      />
    </main>
  );
}
