import { DeferredState } from "@/components/dashboard/deferred-state";

export default function IntegrationsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">التكاملات</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          ربط أنظمة خارجية مثل DRVO ERP — خارج نطاق V1.
        </p>
      </div>
      <DeferredState
        title="التكاملات خارج V1"
        badge="خارج V1"
        description="أساس التكامل موجود في المنصة. استدعاء ERP وأنظمة أخرى مؤجل عبر واجهات صريحة وليس جزءاً من الإطلاق الحالي."
      />
    </div>
  );
}
