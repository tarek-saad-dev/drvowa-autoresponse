import Link from "next/link";

import { LandingFooter } from "@/components/landing/footer";
import { LandingHeader } from "@/components/landing/header";

const COMPANY_NAME =
  process.env.NEXT_PUBLIC_LEGAL_COMPANY_NAME?.trim() || "[COMPANY_NAME]";
const SUPPORT_EMAIL =
  process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim() || "[SUPPORT_EMAIL]";

export default function PrivacyPage() {
  return (
    <div className="flex min-h-full flex-col">
      <LandingHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-12 sm:px-6">
        <h1 className="text-3xl font-bold tracking-tight">سياسة الخصوصية</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          مسودة تقنية للإطلاق — بانتظار مراجعة قانونية (
          EXTERNAL_GATE_LEGAL_REVIEW). الجهة: {COMPANY_NAME}. التواصل:{" "}
          {SUPPORT_EMAIL}.
        </p>
        <div className="mt-8 space-y-6 text-sm leading-7 text-foreground">
          <section>
            <h2 className="text-lg font-semibold">ما نجمعه</h2>
            <p className="mt-2 text-muted-foreground">
              بيانات الحساب (البريد والاسم)، بيانات النشاط التجاري، رسائل واتساب
              اللازمة لتقديم خدمة الرد الآلي، وسجلات الاستخدام والفوترة.
            </p>
          </section>
          <section>
            <h2 className="text-lg font-semibold">كيف نستخدم البيانات</h2>
            <p className="mt-2 text-muted-foreground">
              لتشغيل موظف الاستقبال الذكي، عرض الوارد للموظفين المخوّلين، تطبيق
              حدود الخطة، وتحسين موثوقية الخدمة. لا نبيع بيانات العملاء.
            </p>
          </section>
          <section>
            <h2 className="text-lg font-semibold">المعالجة بواسطة أطراف ثالثة</h2>
            <p className="mt-2 text-muted-foreground">
              قد تُعالَج بعض البيانات عبر مزوّدي الاستضافة والبريد والذكاء
              الاصطناعي وبوابات الدفع عند تفعيلها — وفق عقودهم وسياساتهم. قائمة
              المعالجين النهائية تُحدَّث بعد المراجعة القانونية.
            </p>
          </section>
          <section>
            <h2 className="text-lg font-semibold">الاحتفاظ والأمان</h2>
            <p className="mt-2 text-muted-foreground">
              نقيّد الوصول حسب عضوية النشاط، ونخزّن جلسات المصادقة بشكل آمن،
              ونتجنب تسجيل كلمات المرور أو رموز الجلسة في السجلات العادية.
            </p>
          </section>
          <section>
            <h2 className="text-lg font-semibold">حقوقك وطلبات الحذف</h2>
            <p className="mt-2 text-muted-foreground">
              يمكنك طلب الوصول أو التصحيح أو حذف بيانات الحساب عبر{" "}
              {SUPPORT_EMAIL}. قد نحتفظ بسجلات محدودة للامتثال أو منع الاحتيال
              وفق ما يقرّه المستشار القانوني.
            </p>
          </section>
          <section>
            <h2 className="text-lg font-semibold">التحديثات</h2>
            <p className="mt-2 text-muted-foreground">
              قد نحدّث هذه الصفحة. النسخة المعتمدة قانونياً ستُنشر بعد إغلاق
              EXTERNAL_GATE_LEGAL_REVIEW.
            </p>
          </section>
        </div>
        <p className="mt-10 text-sm">
          <Link href="/" className="text-primary hover:underline">
            العودة للرئيسية
          </Link>
        </p>
      </main>
      <LandingFooter />
    </div>
  );
}
