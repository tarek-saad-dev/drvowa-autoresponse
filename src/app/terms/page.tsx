import Link from "next/link";

import { LandingFooter } from "@/components/landing/footer";
import { LandingHeader } from "@/components/landing/header";

const OPERATOR_NAME =
  process.env.NEXT_PUBLIC_LEGAL_COMPANY_NAME?.trim() || "DRVO TECH";
const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim() || "";

export default function TermsPage() {
  return (
    <div className="flex min-h-full flex-col">
      <LandingHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-12 sm:px-6">
        <h1 className="text-3xl font-bold tracking-tight">شروط الاستخدام</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          شروط تشغيل منصة DRVOWA AutoResponse (الإصدار V1). مشغل الخدمة:{" "}
          {OPERATOR_NAME}.
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          آخر تحديث: 22 سبتمبر 2026
        </p>

        <div className="mt-8 space-y-6 text-sm leading-7 text-foreground">
          <section>
            <h2 className="text-lg font-semibold">الخدمة</h2>
            <p className="mt-2 text-muted-foreground">
              DRVOWA منصة SaaS لموظف استقبال ذكي عبر واتساب. تتيح ربط قناة واتساب،
              إعداد الوكيل وقاعدة المعرفة، وإدارة الوارد، وتطبيق حدود الخطة
              المختارة. أنت مسؤول عن محتوى المعرفة والتعليمات والردود اليدوية
              الصادرة من حسابك.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">الاستخدام المقبول</h2>
            <p className="mt-2 text-muted-foreground">
              يُحظر إساءة استخدام واتساب أو إرسال رسائل غير مرغوب فيها أو محاولة
              اختراق أنظمة الآخرين أو تجاوز حدود الخطة بطرق غير مشروعة.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">الخطط والأسعار</h2>
            <p className="mt-2 text-muted-foreground">
              تتوفر خطط شهرية: FREE و STARTER و PRO و BUSINESS. الأسعار والحدود
              المعروضة في صفحة الفوترة داخل المنصة هي المصدر التجاري الحالي
              للأسعار والحصص. تُطبَّق حدود الخطة (اتصالات واتساب، موظفو الاستقبال،
              المعرفة، الردود الآلية، الرسائل الصادرة) وفق إعدادات الخطة النشطة.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">الدفع اليدوي عبر InstaPay</h2>
            <ul className="mt-2 list-disc space-y-2 pe-5 text-muted-foreground">
              <li>الخطط المدفوعة تُسدَّد حالياً يدوياً عبر InstaPay وفق تعليمات صفحة الفوترة.</li>
              <li>لا يوجد تحقق تلقائي من التحويل؛ الدفع لا يُعتمد تلقائياً.</li>
              <li>تُفعَّل الخطة فقط بعد اعتماد طلب الدفع من مسؤول المنصة.</li>
              <li>لا يوجد خصم تلقائي من بطاقة بنكية في الإصدار الحالي.</li>
              <li>التجديد يدوي: يُنشئ العميل طلباً جديداً ويحوّل وفق المرجع المعروض.</li>
              <li>تجديد نفس الخطة مبكراً يمدّد الفترة المدفوعة المتبقية عند الاعتماد.</li>
              <li>الترقية تبدأ من وقت اعتماد مسؤول المنصة.</li>
              <li>عند انتهاء الفترة المدفوعة تعود صلاحيات النشاط إلى حدود خطة FREE.</li>
              <li>الرجوع إلى FREE لا يحذف تلقائياً بيانات العميل أو موارده؛ قد تُحظر عمليات إنشاء أو إجراءات إضافية وفق حدود FREE.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold">إخلاء مسؤولية واتساب</h2>
            <p className="mt-2 text-muted-foreground">
              DRVOWA ليست شريكاً رسمياً لـ Meta / WhatsApp. التكاملات غير الرسمية قد
              تخضع لقيود من واتساب. لا نضمن عدم تقييد الرقم أو الاستمرارية المطلقة
              لحساب واتساب.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">إخلاء مسؤولية عام</h2>
            <p className="mt-2 text-muted-foreground">
              تُقدَّم الخدمة «كما هي» ضمن الحدود المعقولة للتشغيل. لا تُعلن هنا
              اتفاقية مستوى خدمة (SLA) أو ضمان وقت تشغيل أو سياسة استرداد ثابتة.
              المسؤولية عن قرارات العمل الناتجة عن ردود الذكاء الاصطناعي تقع على
              عاتق النشاط التجاري المستخدم.
            </p>
          </section>

          {SUPPORT_EMAIL ? (
            <section>
              <h2 className="text-lg font-semibold">التواصل</h2>
              <p className="mt-2 text-muted-foreground">
                للاستفسارات التشغيلية:{" "}
                <a
                  href={`mailto:${SUPPORT_EMAIL}`}
                  className="font-medium text-primary hover:underline"
                  dir="ltr"
                >
                  {SUPPORT_EMAIL}
                </a>
                .
              </p>
            </section>
          ) : null}
        </div>

        <p className="mt-10 text-sm">
          <Link href="/" className="text-primary hover:underline">
            العودة للرئيسية
          </Link>
          {" · "}
          <Link href="/privacy" className="text-primary hover:underline">
            سياسة الخصوصية
          </Link>
        </p>
      </main>
      <LandingFooter />
    </div>
  );
}
