import Link from "next/link";

import { LandingFooter } from "@/components/landing/footer";
import { LandingHeader } from "@/components/landing/header";

const OPERATOR_NAME =
  process.env.NEXT_PUBLIC_LEGAL_COMPANY_NAME?.trim() || "DRVO TECH";
const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim() || "";

export default function PrivacyPage() {
  return (
    <div className="flex min-h-full flex-col">
      <LandingHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-12 sm:px-6">
        <h1 className="text-3xl font-bold tracking-tight">سياسة الخصوصية</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          إشعار تشغيلي لمنصة DRVOWA AutoResponse. مشغل الخدمة: {OPERATOR_NAME}.
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          آخر تحديث: 22 سبتمبر 2026
        </p>

        <div className="mt-8 space-y-6 text-sm leading-7 text-foreground">
          <section>
            <h2 className="text-lg font-semibold">نطاق هذا الإشعار</h2>
            <p className="mt-2 text-muted-foreground">
              يوضح هذا الإشعار أنواع البيانات التي تُعالَج لتشغيل خدمة موظف
              الاستقبال الذكي عبر واتساب، وكيف تُستخدم ضمن المنصة. هذه صياغة
              تشغيلية شفافة وليست شهادة قانونية رسمية أو اعتماداً من مستشار
              قانوني.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">ما نجمعه ونعالجه</h2>
            <ul className="mt-2 list-disc space-y-2 pe-5 text-muted-foreground">
              <li>بيانات الحساب: البريد الإلكتروني، الاسم، وكلمة المرور المخزّنة بشكل مشفّر.</li>
              <li>بيانات النشاط التجاري / مساحة العمل: الاسم والإعدادات والعضويات.</li>
              <li>محادثات ورسائل واتساب اللازمة لتقديم الرد الآلي وعرض الوارد للمستخدمين المخوّلين.</li>
              <li>محتوى قاعدة المعرفة والتعليمات المستخدمة لتوليد الردود.</li>
              <li>معالجة الذكاء الاصطناعي اللازمة لتوليد الردود الآلية عند تفعيلها.</li>
              <li>سجلات الفوترة والدفع اليدوي عبر InstaPay (مرجع الدفع، المبلغ، الحالة، قرارات الاعتماد).</li>
              <li>سجلات الاستخدام والأمان والتدقيق اللازمة للتشغيل وحدود الخطة ومنع إساءة الاستخدام.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold">كيف نستخدم البيانات</h2>
            <p className="mt-2 text-muted-foreground">
              تُستخدم البيانات لتشغيل الخدمة، وتمكين الموظفين المخوّلين من إدارة
              الوارد والردود، وتطبيق حدود الخطة، ومعالجة طلبات الفوترة اليدوية،
              وحماية المنصة من إساءة الاستخدام. لا نبيع بيانات العملاء للمعلنين.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">الوصول ونطاق المستأجر</h2>
            <p className="mt-2 text-muted-foreground">
              الوصول إلى بيانات النشاط مقيّد بعضوية مساحة العمل والصلاحيات
              المرتبطة بها (نطاق المستأجر). كلمات المرور وأسرار الجلسة لا تُسجَّل
              عادةً في سجلات التطبيق العادية.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">المعالجون والبنية التحتية</h2>
            <p className="mt-2 text-muted-foreground">
              قد تُعالَج بعض البيانات عبر مزوّدي الاستضافة والبنية التحتية، ومزوّدي
              الذكاء الاصطناعي، والبريد الإلكتروني، أو أنظمة الدفع عند تفعيل تلك
              الخدمات — وفق عقودهم وسياساتهم. لا يعني ذكر فئة معالج أن الخدمة
              مفعّلة دائماً في الإنتاج.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">الاحتفاظ</h2>
            <p className="mt-2 text-muted-foreground">
              تُحتفظ بالبيانات وفق الحاجة التشغيلية والأمنية لتقديم الخدمة وحماية
              الحسابات ومراجعة الفوترة. لا تُعلن هنا مدد احتفاظ قانونية ثابتة؛ قد
              تختلف حسب نوع السجل ومتطلبات التشغيل.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">طلبات التصحيح أو الحذف</h2>
            <p className="mt-2 text-muted-foreground">
              يمكنك طلب الوصول أو التصحيح أو حذف بيانات الحساب عبر قنوات الدعم
              الرسمية للمنصة.
              {SUPPORT_EMAIL ? (
                <>
                  {" "}
                  للتواصل:{" "}
                  <a
                    href={`mailto:${SUPPORT_EMAIL}`}
                    className="font-medium text-primary hover:underline"
                    dir="ltr"
                  >
                    {SUPPORT_EMAIL}
                  </a>
                  .
                </>
              ) : null}
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">التحديثات</h2>
            <p className="mt-2 text-muted-foreground">
              قد نحدّث هذا الإشعار عند تغيّر طريقة تشغيل الخدمة. يظهر تاريخ آخر
              تحديث أعلى الصفحة.
            </p>
          </section>
        </div>

        <p className="mt-10 text-sm">
          <Link href="/" className="text-primary hover:underline">
            العودة للرئيسية
          </Link>
          {" · "}
          <Link href="/terms" className="text-primary hover:underline">
            شروط الاستخدام
          </Link>
        </p>
      </main>
      <LandingFooter />
    </div>
  );
}
