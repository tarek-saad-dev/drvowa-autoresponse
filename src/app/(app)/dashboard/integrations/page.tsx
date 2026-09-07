import { DeferredState } from "@/components/dashboard/deferred-state";

export default function IntegrationsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">التكاملات</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          ربط أنظمة خارجية مثل DRVO ERP لاحقاً.
        </p>
      </div>
      <DeferredState
        title="التكاملات غير مفعّلة بعد"
        description="أساس التكامل موجود في المنصة. استدعاء ERP وأنظمة أخرى مؤجل عبر واجهات صريحة."
      />
    </div>
  );
}
