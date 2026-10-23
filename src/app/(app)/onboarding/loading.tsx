export default function OnboardingLoading() {
  return (
    <main
      dir="rtl"
      className="flex min-h-[100dvh] w-full items-center justify-center bg-background px-6 text-foreground"
      role="status"
      aria-live="polite"
      aria-label="جارٍ تحميل إعداد النشاط"
    >
      <div className="flex max-w-sm flex-col items-center gap-4 text-center">
        <div
          className="h-10 w-10 animate-spin rounded-full border-2 border-primary/20 border-t-primary"
          aria-hidden="true"
        />
        <div>
          <p className="text-base font-bold">جارٍ تجهيز صفحة الإعداد…</p>
          <p className="mt-1 text-sm text-muted-foreground">
            لحظة واحدةً — بنحضّر خطوات إعداد موظف الاستقبال.
          </p>
        </div>
      </div>
    </main>
  );
}
