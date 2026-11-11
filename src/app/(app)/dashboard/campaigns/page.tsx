import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function CampaignsHubPage() {
  return (
    <div className="space-y-6" dir="rtl">
      <div>
        <p className="text-xs font-black text-primary">الحملات</p>
        <h1 className="mt-1 text-3xl font-black tracking-[-0.035em]">مركز الحملات</h1>
        <p className="mt-2 max-w-3xl text-sm leading-7 text-muted-foreground">
          أنشئ حملات بالذكاء الاصطناعي من جمهور CRM، أو راجع مسودات حملات قوائم واتساب. الإرسال دائماً يدوي وبعد تأكيد.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="border-primary/20 bg-primary/[0.03]">
          <CardHeader>
            <Badge variant="info" className="w-fit">جديد</Badge>
            <CardTitle className="mt-2 font-black">منشئ الحملات بالذكاء الاصطناعي</CardTitle>
            <CardDescription>
              صف الجمهور بالعربي، راجع الأهلية، وعدّل الرسالة قبل إنشاء مسودة فقط.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/dashboard/campaigns/create">
              <Button type="button">ابدأ حملة ذكية</Button>
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="font-black">مسودات حملات الموظف</CardTitle>
            <CardDescription>
              حملات القوائم الحالية داخل الموظف الذكي — للمراجعة والاعتماد دون إرسال تلقائي.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/dashboard/agent?tab=campaigns">
              <Button type="button" variant="outline">فتح المسودات</Button>
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="font-black">الشرائح المحفوظة</CardTitle>
            <CardDescription>
              أعد استخدام شرائح الجمهور المحفوظة من CRM قبل بناء حملة جديدة.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Link href="/dashboard/crm/segments">
              <Button type="button" variant="secondary">عرض الشرائح</Button>
            </Link>
            <Link href="/dashboard/crm/follow-ups">
              <Button type="button" variant="ghost">المتابعات</Button>
            </Link>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="font-black">سجل ومسار العمل</CardTitle>
          <CardDescription>
            المسار الآمن: جمهور ← رسالة ← تأكيد إنشاء مسودة ← مراجعة يدوية ← إرسال لاحقاً إن لزم.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm sm:grid-cols-3">
          <div className="rounded-xl border border-border bg-surface/40 px-4 py-3">
            <p className="text-xs font-bold text-muted-foreground">١</p>
            <p className="mt-1 font-black">تحديد الجمهور</p>
            <p className="mt-1 text-xs leading-6 text-muted-foreground">CRM + ERP مع معاينة الأهلية.</p>
          </div>
          <div className="rounded-xl border border-border bg-surface/40 px-4 py-3">
            <p className="text-xs font-bold text-muted-foreground">٢</p>
            <p className="mt-1 font-black">صياغة الرسالة</p>
            <p className="mt-1 text-xs leading-6 text-muted-foreground">مسودة قابلة للتعديل بالكامل.</p>
          </div>
          <div className="rounded-xl border border-border bg-surface/40 px-4 py-3">
            <p className="text-xs font-bold text-muted-foreground">٣</p>
            <p className="mt-1 font-black">تأكيد المسودة فقط</p>
            <p className="mt-1 text-xs leading-6 text-muted-foreground">بدون إرسال تلقائي في أي خطوة.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
