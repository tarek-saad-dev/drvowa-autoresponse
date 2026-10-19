import Link from "next/link";
import { redirect } from "next/navigation";
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

  const paid = plans.filter((plan) => plan.status === "ACTIVE" && plan.code !== "FREE" && plan.monthlyPriceAmount !== null && plan.monthlyPriceAmount > 0);
  return (
    <main dir="rtl" className="min-h-screen bg-background px-4 py-12 text-foreground sm:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto mb-10 max-w-2xl text-center">
          <span className="text-sm font-bold text-primary">الخطوة ٢ من ٣ — اختيار الباقة</span>
          <h1 className="mt-3 text-3xl font-black sm:text-4xl">اختار الخطة المناسبة لشغلك</h1>
          <p className="mt-3 text-muted-foreground">تقدر تختار باقة مدفوعة أو تبدأ مجانًا. مش هيتخصم منك أي مبلغ إلا بعد إتمام الدفع واعتماده.</p>
        </div>
        {paid.length ? (
          <div className="grid gap-5 md:grid-cols-3">
            {paid.map((plan, index) => (
              <article key={plan.planId} className={`flex flex-col rounded-3xl border bg-card p-6 shadow-sm ${plan.code === "PRO" ? "border-primary shadow-lg" : "border-border"}`}>
                {plan.code === "PRO" ? <span className="mb-3 text-xs font-black text-primary">الأكثر اختيارًا</span> : null}
                <h2 className="text-xl font-black">{plan.displayName}</h2>
                <p className="mt-4 text-3xl font-black" dir="ltr">{new Intl.NumberFormat("en-EG").format(plan.monthlyPriceAmount!)} {plan.currencyCode ?? "EGP"}</p>
                <p className="mt-1 text-sm text-muted-foreground">شهريًا · الدفع بعد تجهيز النشاط</p>
                <ul className="my-7 flex-1 space-y-3 text-sm">
                  {benefits.map((benefit) => <li key={benefit}>✓ {benefit}</li>)}
                  <li>✓ {plan.monthlyAiReplies?.toLocaleString("en-US") ?? "غير محدد"} رد ذكاء اصطناعي شهريًا</li>
                  <li>✓ {plan.maxWhatsAppConnections ?? "غير محدد"} اتصال واتساب</li>
                </ul>
                <Link href={`/onboarding?plan=${encodeURIComponent(plan.code)}`} className="rounded-xl bg-primary px-4 py-3 text-center font-bold text-primary-foreground hover:opacity-90">اختار الباقة ←</Link>
              </article>
            ))}
          </div>
        ) : (
          <div role="alert" className="rounded-2xl border border-border p-5 text-center">الباقات المدفوعة غير متاحة حاليًا. تقدر تبدأ مجانًا.</div>
        )}
        <div className="mt-7 flex flex-col items-center gap-3 rounded-2xl border border-border/70 bg-card/50 p-6 text-center sm:flex-row sm:justify-between sm:text-start">
          <div>
            <h2 className="font-bold">عايز تجرّب الأول؟</h2>
            <p className="mt-1 text-sm text-muted-foreground">ابدأ بالخطة المجانية وبعدين تقدر ترقي في أي وقت.</p>
          </div>
          <Link href="/onboarding?plan=FREE" className="rounded-xl border border-border px-5 py-2.5 text-sm font-bold text-muted-foreground transition hover:border-primary hover:text-foreground">ابدأ مجانًا ←</Link>
        </div>
      </div>
    </main>
  );
}