
import Link from "next/link";

import type { AdminFinancialReport } from "@/modules/billing/admin-financial-report";

const number = new Intl.NumberFormat("ar-EG", { maximumFractionDigits: 0 });
const moneyNumber = new Intl.NumberFormat("ar-EG", { maximumFractionDigits: 2 });
const dayFormat = new Intl.DateTimeFormat("ar-EG", {
  day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
});
const monthFormat = new Intl.DateTimeFormat("ar-EG", {
  month: "short", timeZone: "UTC",
});

function money(value: number): string {
  return moneyNumber.format(value) + " ج.م";
}

function monthLabel(key: string): string {
  return monthFormat.format(new Date(key + "-01T00:00:00.000Z"));
}

function dateLabel(value: Date): string {
  return dayFormat.format(value);
}

function Kpi({
  label, value, hint, href, accent = false,
}: {
  label: string;
  value: string;
  hint: string;
  href?: string;
  accent?: boolean;
}) {
  const inner = (
    <div className="flex h-full flex-col justify-between gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-bold text-muted-foreground sm:text-sm">{label}</p>
        {href ? <span aria-hidden="true" className="text-muted-foreground">↗</span> : null}
      </div>
      <div>
        <p className={accent
          ? "break-words text-2xl font-black tracking-tight text-primary sm:text-3xl"
          : "break-words text-2xl font-black tracking-tight sm:text-3xl"
        }>{value}</p>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">{hint}</p>
      </div>
    </div>
  );

  const classes = "block min-h-[154px] rounded-2xl border border-border bg-card p-5 shadow-sm transition hover:border-primary/30 hover:shadow-md";
  return href ? <Link href={href} className={classes}>{inner}</Link> : <div className={classes}>{inner}</div>;
}

export function AdminFinancialDashboard({
  report, detail = false,
}: {
  report: AdminFinancialReport;
  detail?: boolean;
}) {
  const { overview: o, trend, plans, renewals, recent } = report;
  const max = Math.max(1, ...trend.map((entry) => entry.amountEgp));
  const planTotal = plans.reduce((sum, plan) => sum + plan.count, 0);
  const change = o.previousMonthEgp > 0
    ? ((o.collectedEgp - o.previousMonthEgp) / o.previousMonthEgp) * 100
    : null;
  const month = new Intl.DateTimeFormat("ar-EG", {
    month: "long", year: "numeric", timeZone: "UTC",
  }).format(report.generatedAtUtc);

  return (
    <div className="space-y-6 pb-8">
      <section className="relative overflow-hidden rounded-[28px] bg-sidebar p-6 text-sidebar-foreground shadow-md sm:p-8">
        <div aria-hidden="true" className="pointer-events-none absolute -left-16 -top-24 h-80 w-80 rounded-full bg-primary/25 blur-3xl" />
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-24 right-1/3 h-64 w-64 rounded-full bg-cyan-400/10 blur-3xl" />
        <div className="relative flex flex-col gap-7 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <span className="inline-flex rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-bold text-white/80">
              DRVO / PLATFORM OVERVIEW
            </span>
            <h1 className="mt-4 text-2xl font-black tracking-tight sm:text-4xl">
              {detail ? "المالية والاشتراكات" : "لوحة قيادة DRVO AutoResponse"}
            </h1>
            <p className="mt-3 text-sm leading-7 text-white/70">
              متابعة العملاء والاشتراكات والتحصيلات المعتمدة ومواعيد التجديد،
              بأرقام مباشرة من قاعدة بيانات المنصة.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Link href="/admin/payments?status=PENDING" className="rounded-xl bg-white px-4 py-2 text-sm font-black text-slate-900 transition hover:bg-white/90">
                مراجعة المدفوعات ←
              </Link>
              <Link href="/admin/financials" className="rounded-xl border border-white/25 bg-white/10 px-4 py-2 text-sm font-bold text-white transition hover:bg-white/20">
                التقارير المالية
              </Link>
              <Link href="/admin/subscriptions" className="rounded-xl border border-white/25 bg-white/10 px-4 py-2 text-sm font-bold text-white transition hover:bg-white/20">
                العملاء والاشتراكات
              </Link>
            </div>
          </div>
          <div className="rounded-2xl border border-white/15 bg-white/10 p-5 lg:min-w-60">
            <p className="text-xs text-white/65">المتحصلات المعتمدة • {month}</p>
            <p className="mt-2 text-3xl font-black tabular-nums sm:text-4xl">{money(o.collectedEgp)}</p>
            <p className="mt-2 text-xs text-white/65">
              {change === null
                ? "لا توجد متحصلات معتمدة في الشهر السابق للمقارنة"
                : (change >= 0 ? "▲ " : "▼ ") + number.format(Math.abs(change)) + "% مقارنة بالشهر السابق"}
            </p>
          </div>
        </div>
      </section>

      {(o.pendingCount > 0 || o.pastDue > 0 || o.expiringSoon > 0) ? (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-warning/20 bg-warning-soft/35 px-5 py-4 text-sm">
          <span className="font-black text-foreground">محتاج متابعة:</span>
          {o.pendingCount > 0 ? <Link href="/admin/payments?status=PENDING" className="font-bold text-warning underline-offset-4 hover:underline">{number.format(o.pendingCount)} طلب دفع معلّق</Link> : null}
          {o.pastDue > 0 ? <span className="font-bold text-warning">{number.format(o.pastDue)} اشتراك متأخر</span> : null}
          {o.expiringSoon > 0 ? <a href="#renewals" className="font-bold text-warning underline-offset-4 hover:underline">{number.format(o.expiringSoon)} اشتراك ينتهي خلال 7 أيام</a> : null}
        </div>
      ) : null}

      <section aria-label="مؤشرات المنصة">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-black">أهم المؤشرات</h2>
            <p className="mt-1 text-xs text-muted-foreground">القيم بالجنيه المصري، والتواريخ حسب UTC</p>
          </div>
          <span className="rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground">
            آخر تحديث {new Intl.DateTimeFormat("ar-EG", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Cairo" }).format(report.generatedAtUtc)} بتوقيت القاهرة
          </span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Kpi label="المتحصلات هذا الشهر" value={money(o.collectedEgp)} hint={number.format(o.approvedCount) + " عملية دفع معتمدة"} accent href="/admin/payments?status=APPROVED" />
          <Kpi label="القيمة الشهرية للخطط النشطة" value={money(o.estimatedMonthlyRunRateEgp)} hint="تقدير بالأسعار الحالية، وليس إيرادًا تم تحصيله" />
          <Kpi label="اشتراكات مدفوعة نشطة" value={number.format(o.activePaid)} hint="الخطط المدفوعة السارية فقط" href="/admin/subscriptions?status=PAID" />
          <Kpi label="طلبات دفع بانتظار المراجعة" value={number.format(o.pendingCount)} hint={money(o.pendingAmountEgp) + " لم تُحتسب كمتحصلات"} href="/admin/payments?status=PENDING" />
          <Kpi label="كل المتحصلات المعتمدة" value={money(o.allTimeCollectedEgp)} hint="إجمالي المدفوعات المعتمدة المسجلة (EGP)" href="/admin/payments?status=APPROVED" />
          <Kpi label="مساحات العمل" value={number.format(o.businesses)} hint={number.format(o.activeFree) + " اشتراك مجاني نشط"} href="/admin/subscriptions" />
          <Kpi label="تجربة مجانية" value={number.format(o.trialing)} hint="اشتراكات في فترة التجربة الحالية" href="/admin/subscriptions?status=TRIAL" />
          <Kpi label="اشتراكات تحتاج متابعة" value={number.format(o.pastDue + o.expiringSoon)} hint={number.format(o.pastDue) + " متأخرة · " + number.format(o.expiringSoon) + " تنتهي خلال 7 أيام"} href="/admin/subscriptions?status=EXPIRING" />
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <section className="rounded-[24px] border border-border bg-card p-5 shadow-sm sm:p-6" aria-labelledby="monthly-trend">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 id="monthly-trend" className="text-lg font-black">اتجاه التحصيلات</h2>
              <p className="mt-1 text-xs leading-6 text-muted-foreground">المدفوعات المعتمدة شهريًا • بدون الطلبات المعلّقة</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <a
                href={"/api/admin/financials/export?range=" + report.months}
                className="rounded-xl border border-border bg-card px-3 py-2 text-xs font-bold text-primary transition hover:bg-surface"
              >
                تصدير CSV ↓
              </a>
              <div className="flex rounded-xl border border-border bg-surface p-1 text-xs font-bold">
              <Link href={detail ? "/admin/financials?range=6#monthly-trend" : "/admin#monthly-trend"} className={"rounded-lg px-3 py-2 " + (report.months === 6 ? "bg-card text-primary shadow-sm" : "text-muted-foreground")}>6 شهور</Link>
              <Link href="/admin/financials?range=12#monthly-trend" className={"rounded-lg px-3 py-2 " + (report.months === 12 ? "bg-card text-primary shadow-sm" : "text-muted-foreground")}>سنة</Link>
              </div>
            </div>
          </div>
          <div className="mt-7 flex h-56 items-end gap-2 border-b border-border pb-0 sm:gap-3" role="img" aria-label="رسم بياني لمتحصلات الأشهر المحددة">
            {trend.map((entry) => (
              <div key={entry.month} className="group flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-2">
                <span className="truncate text-[10px] font-bold tabular-nums text-muted-foreground opacity-0 transition group-hover:opacity-100 sm:text-xs">
                  {entry.amountEgp > 0 ? number.format(entry.amountEgp) : "0"}
                </span>
                <div className="flex h-[78%] w-full items-end justify-center">
                  <div
                    title={entry.month + ": " + money(entry.amountEgp) + "، " + entry.approvals + " عمليات"}
                    className={"w-full max-w-12 rounded-t-lg transition-all " + (entry.amountEgp > 0 ? "bg-primary/75 hover:bg-primary" : "bg-secondary")}
                    style={{ height: entry.amountEgp > 0 ? Math.max(5, entry.amountEgp / max * 100) + "%" : "3px" }}
                  />
                </div>
                <span className="mb-[-26px] whitespace-nowrap text-[10px] font-bold text-muted-foreground sm:text-xs">{monthLabel(entry.month)}</span>
              </div>
            ))}
          </div>
          <div className="mt-9 flex items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>كل عمود = شهر تقويمي (UTC)</span>
            <span>{number.format(trend.reduce((sum, value) => sum + value.approvals, 0))} عملية معتمدة</span>
          </div>
        </section>

        <section id="plans" className="rounded-[24px] border border-border bg-card p-5 shadow-sm sm:p-6">
          <h2 className="text-lg font-black">توزيع الخطط</h2>
          <p className="mt-1 text-xs leading-6 text-muted-foreground">اشتراكات سارية فقط، والخطط المجانية والتجريبية ظاهرة في التوزيع</p>
          <div className="mt-6 space-y-5">
            {plans.length === 0 ? (
              <p className="rounded-xl bg-surface p-6 text-center text-sm text-muted-foreground">لا توجد اشتراكات سارية حتى الآن.</p>
            ) : plans.map((plan) => {
              const percentage = planTotal ? Math.round(plan.count / planTotal * 100) : 0;
              return (
                <div key={plan.code}>
                  <div className="mb-2 flex items-center justify-between gap-4 text-sm">
                    <div><strong>{plan.name}</strong><span className="mr-2 text-[10px] text-muted-foreground" dir="ltr">{plan.code}</span></div>
                    <span className="font-black tabular-nums">{number.format(plan.count)} <span className="text-xs font-normal text-muted-foreground">({percentage}%)</span></span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-secondary">
                    <div className="h-full rounded-full bg-primary transition-all" style={{ width: percentage + "%" }} />
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-6 rounded-2xl bg-surface p-4 text-xs leading-6 text-muted-foreground">
            قيمة الاشتراكات الشهرية تقدير تشغيلي من أسعار الباقات الحالية؛ لا تمثل MRR محاسبي مثبت ولا توقعًا بتحصيل تلقائي.
          </div>
        </section>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <section id="renewals" className="overflow-hidden rounded-[24px] border border-border bg-card shadow-sm">
          <div className="flex items-center justify-between gap-3 p-5 sm:p-6">
            <div>
              <h2 className="text-lg font-black">اشتراكات قريبة من الانتهاء</h2>
              <p className="mt-1 text-xs text-muted-foreground">أقرب المواعيد خلال 14 يومًا</p>
            </div>
            <span className="rounded-lg bg-warning-soft px-3 py-1 text-xs font-black text-warning">{number.format(o.expiringSoon)} خلال 7 أيام</span>
          </div>
          {renewals.length === 0 ? (
            <p className="px-6 pb-7 text-sm text-muted-foreground">مفيش اشتراكات مدفوعة بتنتهي خلال الأسبوعين الجايين.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[410px] text-right text-sm">
                <thead className="bg-surface text-xs text-muted-foreground"><tr><th className="px-5 py-3">العميل</th><th className="px-4 py-3">الخطة</th><th className="px-5 py-3">الانتهاء</th></tr></thead>
                <tbody className="divide-y divide-border">
                  {renewals.map((renewal) => (
                    <tr key={renewal.subscriptionId} className="hover:bg-surface/50">
                      <td className="max-w-48 truncate px-5 py-3 font-bold">{renewal.businessName}</td>
                      <td className="px-4 py-3 text-muted-foreground">{renewal.planName}</td>
                      <td className="whitespace-nowrap px-5 py-3 font-semibold">{dateLabel(renewal.periodEndUtc)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="overflow-hidden rounded-[24px] border border-border bg-card shadow-sm">
          <div className="flex items-center justify-between gap-3 p-5 sm:p-6">
            <div>
              <h2 className="text-lg font-black">آخر المدفوعات المعتمدة</h2>
              <p className="mt-1 text-xs text-muted-foreground">آخر عمليات تم اعتمادها بعد المراجعة</p>
            </div>
            <Link href="/admin/payments?status=APPROVED" className="shrink-0 text-xs font-black text-primary hover:underline">عرض الكل ←</Link>
          </div>
          {recent.length === 0 ? (
            <p className="px-6 pb-7 text-sm text-muted-foreground">لسه مفيش مدفوعات تم اعتمادها.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[440px] text-right text-sm">
                <thead className="bg-surface text-xs text-muted-foreground"><tr><th className="px-5 py-3">العميل / الباقة</th><th className="px-4 py-3">التاريخ</th><th className="px-5 py-3">المبلغ</th></tr></thead>
                <tbody className="divide-y divide-border">
                  {recent.map((payment) => (
                    <tr key={payment.paymentRequestId} className="hover:bg-surface/50">
                      <td className="max-w-56 px-5 py-3"><p className="truncate font-bold">{payment.businessName}</p><p className="mt-1 truncate text-xs text-muted-foreground">{payment.planName} · {payment.reference}</p></td>
                      <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{dateLabel(payment.reviewedAtUtc)}</td>
                      <td className="whitespace-nowrap px-5 py-3 font-black text-success">{money(payment.amountEgp)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <div className="rounded-2xl border border-border bg-card px-5 py-4 text-xs leading-6 text-muted-foreground">
        <strong className="text-foreground">تعريف البيانات:</strong> التحصيلات = طلبات InstaPay بحالة APPROVED وتاريخ اعتماد داخل الفترة، بعملة EGP فقط.
        الطلبات المعلّقة لا تُحسب ضمن التحصيلات. القيمة الشهرية المتوقعة تُحسب من الخطط النشطة المدفوعة ذات دورة شهرية وسعر حالي،
        ولا تشمل عمولات أو ضرائب أو مصروفات أو عمليات استرداد غير مسجلة. أرقام اللوحة للمتابعة التشغيلية وليست قوائم مالية أو إثبات تسوية بنكية.
      </div>
    </div>
  );
}
