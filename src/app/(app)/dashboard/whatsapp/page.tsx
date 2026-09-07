import { DeferredState } from "@/components/dashboard/deferred-state";

export default function WhatsAppPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">واتساب</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          إعداد قناة واتساب لمساحة العمل.
        </p>
      </div>
      <DeferredState
        title="ربط واتساب في المرحلة 2"
        description="Connection setup arrives in Phase 2. إعداد الاتصال يصل في المرحلة التالية — بدون QR أو Baileys في هذه المرحلة."
        badge="المرحلة 2"
      />
    </div>
  );
}
