import { DeferredState } from "@/components/dashboard/deferred-state";

export default function InboxPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">الوارد</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          محادثات العملاء ستظهر هنا بعد الربط.
        </p>
      </div>
      <DeferredState
        title="صندوق الوارد غير مفعّل بعد"
        description="Messaging will appear after WhatsApp is connected. ستظهر الرسائل بعد ربط واتساب."
      />
    </div>
  );
}
