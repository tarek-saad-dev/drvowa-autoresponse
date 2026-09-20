import Link from "next/link";

import { LandingFooter } from "@/components/landing/footer";
import { LandingHeader } from "@/components/landing/header";

const COMPANY_NAME =
  process.env.NEXT_PUBLIC_LEGAL_COMPANY_NAME?.trim() || "[COMPANY_NAME]";
const SUPPORT_EMAIL =
  process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim() || "[SUPPORT_EMAIL]";

export default function TermsPage() {
  return (
    <div className="flex min-h-full flex-col">
      <LandingHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-12 sm:px-6">
        <h1 className="text-3xl font-bold tracking-tight">شروط الاستخدام</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          مسودة تقنية للإطلاق — بانتظار مراجعة قانونية (
          EXTERNAL_GATE_LEGAL_REVIEW). الجهة: {COMPANY_NAME}. التواصل:{" "}
          {SUPPORT_EMAIL}.
        </p>
        <div className="mt-8 space-y-6 text-sm leading-7 text-foreground">
          <section>
            <h2 className="text-lg font-semibold">الخدمة</h2>
            <p className="mt-2 text-muted-foreground">
              DRVOWA AutoResponse منصة SaaS لموظف استقبال ذكي عبر واتساب. أنت
              مسؤول عن محتوى المعرفة والتعليمات والردود اليدوية الصادرة من حسابك.
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
            <h2 className="text-lg font-semibold">إخلاء مسؤولية واتساب</h2>
            <p className="mt-2 text-muted-foreground">
              لسنا شريكاً رسمياً لواتساب/Meta. استخدام واجهات غير رسمية قد يعرّض
              الرقم لقيود من واتساب. لا نضمن عدم الحظر أو الاستمرارية المطلقة.
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
