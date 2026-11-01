import { redirect } from "next/navigation";
import Link from "next/link";
import { requireAuthenticatedUser } from "@/lib/tenancy/require-user";
import { resolveActiveBusiness } from "@/lib/tenancy/active-business";
import {
  PRICING_V1_PLANS,
  PRICING_V1_ADDONS,
  PRICING_V1_COMING_SOON,
} from "@/modules/pricing/pricing-v1-catalog";

const format = (n: number) => new Intl.NumberFormat("en-US").format(n);
const addonNames: Record<string, string> = {
  replies_250: "250 رد إضافي", replies_1000: "1,000 رد إضافي",
  replies_3000: "3,000 رد إضافي", seat_1: "موظف إضافي",
  seats_5: "5 موظفين إضافيين", voice_60: "60 دقيقة صوت",
  voice_200: "200 دقيقة صوت", assisted_setup: "إعداد الموظف بمعرفتنا",
  knowledge_import: "استيراد المعرفة", team_training: "تدريب الفريق",
};

/** Preview only: not a checkout, and never replaces the live billing catalog. */
export default async function PricingPreviewPage() {
  const user = await requireAuthenticatedUser();
  const businessId = await resolveActiveBusiness(user.userId, user.activeBusinessId);
  if (!businessId) redirect("/onboarding");
  if (process.env.DRVO_PRICING_V1_PREVIEW !== "true") redirect("/dashboard/billing");

  return (
    <main className="mx-auto w-full max-w-5xl space-y-7 pb-14" dir="rtl">
      <header className="space-y-2">
        <Link href="/dashboard/billing" className="text-sm text-primary hover:underline">العودة للاشتراك والاستخدام</Link>
        <h1 className="text-2xl font-black sm:text-3xl">الباقات الجديدة</h1>
        <p className="text-sm text-muted-foreground">معاينة فقط — الأسعار المعروضة هنا غير مفعّلة للدفع. اشتراكك الحالي وشروطه لم تتغير.</p>
      </header>
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="الباقات المقترحة">
        {PRICING_V1_PLANS.map((plan) => (
          <article key={plan.code} className={`rounded-2xl border bg-card p-5 space-y-3 ${plan.code === "PRO" ? "border-primary" : "border-border"}`}>
            <div className="text-sm font-bold">{plan.nameAr}</div>
            <div className="text-2xl font-black">{format(plan.monthlyEgp)} <span className="text-xs font-normal text-muted-foreground">ج / شهر</span></div>
            {plan.code === "FREE" ? (
              <p className="text-sm text-muted-foreground">30 رد لمرة واحدة أو 7 أيام، أيهما أسبق</p>
            ) : (
              <p className="text-sm text-muted-foreground">{format(plan.annualEgp)} ج سنويًا، تدفع مقدمًا</p>
            )}
            <ul className="space-y-2 text-sm">
              <li>{format(plan.aiReplies)} رد ذكي {plan.code === "FREE" ? "إجمالًا" : "/ شهر"}</li>
              <li>{format(plan.seats)} مستخدم</li>
              <li>{format(plan.knowledgeItems)} معلومة للنشاط</li>
              <li>رقم واتساب واحد</li>
            </ul>
            <p className="text-xs text-muted-foreground">الاشتراك غير متاح من المعاينة</p>
          </article>
        ))}
      </section>
      <section className="space-y-3">
        <h2 className="text-lg font-bold">الإضافات المقترحة</h2>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {PRICING_V1_ADDONS.map((addon) => (
            <div key={addon.code} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 text-sm">
              <span>{addonNames[addon.code] ?? addon.code}</span>
              <strong className="whitespace-nowrap">{("priceIsStartingFrom" in addon && addon.priceIsStartingFrom) ? "من " : ""}{format(addon.priceEgp)} ج</strong>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">الأسعار نهائية مبدئيًا من ناحية التصميم فقط، ولم يتم تفعيل شراء الإضافات.</p>
      </section>
      {PRICING_V1_COMING_SOON.includes("multiple_whatsapp_numbers") && (
        <section className="rounded-xl border border-dashed border-border p-4">
          <h2 className="font-semibold">أكثر من رقم واتساب — قريبًا</h2>
          <p className="mt-1 text-sm text-muted-foreground">كل باقة حاليًا تدعم رقم واتساب واحد، والتعدد غير متاح للشراء.</p>
        </section>
      )}
    </main>
  );
}
