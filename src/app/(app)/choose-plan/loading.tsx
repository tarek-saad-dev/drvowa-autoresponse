import { DrvoLoading } from "@/components/ui/drvo-loading";

export default function ChoosePlanLoading() {
  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-background">
      <DrvoLoading
        label="بنجهّز الباقات…"
        hint="بنحضّر الاختيارات المناسبة لنشاطك."
      />
    </main>
  );
}
