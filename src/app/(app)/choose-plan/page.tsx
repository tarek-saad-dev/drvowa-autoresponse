import Link from "next/link";
import { cookies } from "next/headers";
import { getPublicPromo,previewPromoPrice } from "@/modules/pricing/public-promo";
import { redirect } from "next/navigation";
import { OnboardingLogoutButton } from "@/components/onboarding/onboarding-logout-button";
import { requireAuthenticatedUser } from "@/lib/tenancy/require-user";
import { listBusinessesForUser } from "@/modules/businesses/service";
import { isPlatformAdminUser } from "@/modules/platform-admin/service";
import { listActivePlans } from "@/modules/billing/service";

const benefits = [
  "مساعد ذكي مخصص لنشاطك",
  "إدارة معلومات النشاط والردود",
  "مراجعة المحادثات والتحكم في الرد",
];

export default async function ChoosePlanPage() {
  const user = await requireAuthenticatedUser();
  const [businesses, admin, plans] = await Promise.all([
    listBusinessesForUser(user.userId),
    isPlatformAdminUser(user.userId),
    listActivePlans(),
  ]);
  if (admin) redirect("/admin");
  if (businesses.length) redirect("/dashboard/billing");

  const promoCode=(await cookies()).get("drvo_promo_code")?.value;
  const promo=promoCode?await getPublicPromo(promoCode):null;
  const paid = plans.filter((plan) => plan.status === "ACTIVE" && plan.code !== "FREE" && plan.monthlyPriceAmount != null && plan.monthlyPriceAmount > 0);
  return (
    <main dir="rtl" className="min-h-screen bg-background px-4 py-10 text-foreground sm:px-8 sm:py-14">
      <div className="mx-auto max-w-6xl">
        <div className="mb-5 flex justify-end">
          <OnboardingLogoutButton />
        </div>
        <div className="mx-auto mb-12 max-w-2xl text-center">
          <span dir="ltr" className="text-xs font-bold tracking-[0.15em] text-primary">DRVO / YOUR PLAN</span>
          <h1 className="mt-3 font-display text-3xl font-bold tracking-tight sm:text-4xl">اختار الخطة المناسبة لشغلك</h1>
          <p className="mt-3 text-sm leading-7 text-muted-foreground sm:text-base">تقدر تختار باقة مدفوعة أو تبدأ مجانًا. مش هيتخصم منك أي مبلغ إلا بعد إتمام الدفع واعتماده.</p>
        </div>
        {promo ? <div role="status" className="mx-auto mb-6 max-w-2xl rounded-2xl border border-primary/30 bg-primary/5 p-4 text-center text-sm leading-6">
          <b>عرضك الخاص محفوظ 🎟</b>
          <p className="mt-1 text-muted-foreground">
            كود <strong dir="ltr" className="font-mono">{promo.code}</strong>
            {" · "}{promo.kind==="PERCENT"?promo.value+"%":promo.value+" جنيه"} خصم على أول اشتراك مدفوع
            {promo.billingInterval==="ANNUAL"?" سنوي":promo.billingInterval==="MONTHLY"?" شهري":""}.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">هنحسب المبلغ بعد الخصم وقت تجهيز طلب الدفع، وبعد ما تجهّز نشاطك.</p>
        </div> : null}
        {paid.length ? (
          <div className="grid gap-5 md:grid-cols-3">
            {paid.map((plan) => (
              <article key={plan.planId} className={`flex min-w-0 flex-col rounded-3xl border bg-card p-6 shadow-sm transition-colors motion-reduce:transition-none ${plan.code === "PRO" ? "border-primary/60 shadow-md" : "border-border hover:border-primary/40"}`}>
                {plan.code === "PRO" ? <span className="mb-3 text-xs font-bold text-primary">الأكثر اختيارًا</span> : null}
                <h2 className="font-display text-xl font-bold">{plan.displayName}</h2>
                <p className="mt-4 text-3xl font-bold tabular-nums" dir="ltr">{new Intl.NumberFormat("en-EG").format(plan.monthlyPriceAmount!)} {plan.currencyCode ?? "EGP"}</p>
                <p className="mt-1 text-sm text-muted-foreground">شهريًا · الدفع بعد تجهيز النشاط</p>
                {promo && promo.billingInterval!=="ANNUAL" && (!promo.planCode||promo.planCode===plan.code)
                 ? (()=>{const preview=previewPromoPrice({kind:promo.kind,value:promo.value,baseEgp:Number(plan.monthlyPriceAmount)});
                   return preview ? <p className="mt-2 text-sm font-bold text-primary">
                     بعد كود الخصم: {new Intl.NumberFormat("en-EG",{maximumFractionDigits:2}).format(preview.discountedEgp)} جنيه / شهر
                   </p> : null;
                 })() : null}
                <ul className="my-7 flex-1 space-y-3 text-sm leading-6">
                  {benefits.map((benefit) => <li key={benefit}>✓ {benefit}</li>)}
                  <li>✓ {plan.monthlyAiReplies?.toLocaleString("en-US") ?? "غير محدد"} رد ذكاء اصطناعي شهريًا</li>
                  <li>✓ {plan.maxWhatsAppConnections ?? "غير محدد"} اتصال واتساب</li>
                </ul>
                <Link
                  href={`/onboarding?plan=${encodeURIComponent(plan.code)}`}
                  prefetch={false}
                  className="flex min-h-12 items-center justify-center rounded-xl bg-primary px-4 py-3 text-center font-bold text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none"
                >
                  اختار الباقة ←
                </Link>
              </article>
            ))}
          </div>
        ) : (
          <div role="alert" className="rounded-2xl border border-border p-5 text-center">الباقات المدفوعة غير متاحة حاليًا. تقدر تبدأ مجانًا.</div>
        )}
        <div className="mt-7 flex flex-col items-center gap-4 rounded-2xl border border-border bg-card/70 p-6 text-center sm:flex-row sm:justify-between sm:text-start">
          <div>
            <h2 className="font-bold">عايز تجرّب الأول؟</h2>
            <p className="mt-1 text-sm text-muted-foreground">ابدأ بالخطة المجانية وبعدين تقدر ترقي في أي وقت.</p>
          </div>
          <Link
            href="/onboarding?plan=FREE"
            prefetch={false}
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-input bg-card px-5 py-2.5 text-sm font-bold text-foreground transition-colors hover:border-primary hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none"
          >
            ابدأ مجانًا ←
          </Link>
        </div>
      </div>
    </main>
  );
}
