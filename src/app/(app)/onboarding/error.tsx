"use client";

export default function OnboardingError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main
      dir="rtl"
      className="flex min-h-[100dvh] w-full items-center justify-center bg-background px-6 text-foreground"
    >
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 text-center shadow-sm">
        <p className="text-base font-bold">تعذر فتح صفحة الإعداد</p>
        <p className="mt-2 text-sm text-muted-foreground">
          حصل خطأ أثناء تحميل الإعداد. تقدر تحاول مرة أخرى بدون ما تفقد تقدمك المحفوظ على هذا الجهاز.
        </p>
        {error.digest ? (
          <p className="mt-3 font-mono text-[11px] text-muted-foreground" dir="ltr">
            ref: {error.digest}
          </p>
        ) : null}
        <button
          type="button"
          onClick={reset}
          className="mt-5 inline-flex rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground hover:opacity-90"
        >
          إعادة المحاولة
        </button>
      </div>
    </main>
  );
}
