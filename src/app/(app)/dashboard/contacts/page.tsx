import { DeferredState } from "@/components/dashboard/deferred-state";

export default function ContactsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">جهات الاتصال</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          دليل العملاء المرتبط بالمحادثات.
        </p>
      </div>
      <DeferredState
        title="جهات الاتصال لاحقاً"
        description="Available with messaging in a later phase. تتوفر مع المراسلة في مرحلة لاحقة."
      />
    </div>
  );
}
