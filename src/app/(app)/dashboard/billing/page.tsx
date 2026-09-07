import { DeferredState } from "@/components/dashboard/deferred-state";

export default function BillingPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">الفوترة</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          الاشتراك وخطط الاستخدام.
        </p>
      </div>
      <DeferredState
        title="الدفع مؤجل"
        description="Subscription infrastructure is ready; payment checkout is deferred. بنية الاشتراك جاهزة؛ إتمام الدفع مؤجل."
      />
    </div>
  );
}
