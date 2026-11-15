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
          كوّن جمهورًا من CRM أو استخدم شريحة محفوظة، اكتب الرسالة، ثم راجع المسودة والموافقات قبل بدء الإرسال يدويًا.
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
            <CardTitle className="font-black">مسودات الحملات والإرسال</CardTitle>
            <CardDescription>
              راجع نص الرسالة واعتمدها وافحص المستلمين المؤهلين، ثم ابدأ الإرسال إذا كان المحرك مفعّلًا وبعد تأكيدك النهائي.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/dashboard/campaigns/drafts">
              <Button type="button" variant="outline">مراجعة المسودات والإرسال</Button>
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="font-black">الشرائح المحفوظة</CardTitle>
            <CardDescription>
              اختَر شريحة محفوظة وأنشئ حملة منها من غير إعادة كتابة شروط الجمهور.
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
            المسار الآمن: جمهور ← رسالة ← مسودة ← اعتماد النص وفحص الموافقات ← تأكيد بدء الإرسال.
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
            <p className="mt-1 font-black">مراجعة المستلمين والإرسال</p>
            <p className="mt-1 text-xs leading-6 text-muted-foreground">لا يبدأ الإرسال إلا بأمر صريح وبعد تحقق شروط الأهلية.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
