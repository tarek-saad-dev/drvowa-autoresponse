import { DeferredState } from "@/components/dashboard/deferred-state";
import Link from "next/link";

export default function ContactsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">جهات الاتصال</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          دليل منفصل لجهات الاتصال غير مفعّل في V1. العملاء يظهرون داخل المحادثات.
        </p>
      </div>
      <DeferredState
        title="دليل جهات الاتصال خارج V1"
        badge="خارج V1"
        description="المحادثات والرد اليدوي متاحان الآن من صندوق الوارد. دليل جهات اتصال مستقل سيأتي لاحقاً."
      />
      <p className="text-sm">
        <Link href="/dashboard/inbox" className="font-medium text-primary hover:underline">
          فتح صندوق الوارد
        </Link>
      </p>
    </div>
  );
}
