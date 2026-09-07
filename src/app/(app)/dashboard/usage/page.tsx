import { DeferredState } from "@/components/dashboard/deferred-state";

export default function UsagePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">الاستخدام</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          قياس الرسائل واستدعاءات الذكاء الاصطناعي.
        </p>
      </div>
      <DeferredState
        title="لا يوجد استخدام مسجّل بعد"
        description="No usage recorded yet. لم يُسجَّل استخدام بعد — القياس يبدأ مع المراسلة والردود."
        badge="فارغ"
      />
    </div>
  );
}
