import Link from "next/link";
import { PrivateUnlimitedAction } from "@/components/admin/private-unlimited-action";
import { requirePlatformAdmin } from "@/modules/platform-admin/service";

import {
  listAdminSubscriptions,
  parseAdminSubscriptionFilter,
  type AdminSubscriptionItem,
} from "@/modules/billing/admin-subscriptions";

export const dynamic = "force-dynamic";

const fmt = new Intl.NumberFormat("ar-EG", { maximumFractionDigits: 0 });
const fmtMoney = new Intl.NumberFormat("ar-EG", { maximumFractionDigits: 2 });
const dateFormat = new Intl.DateTimeFormat("ar-EG", {
  dateStyle: "medium", timeZone: "Africa/Cairo",
});

function date(value: Date | null): string {
  return value ? dateFormat.format(value) : "—";
}

function statusOf(item: AdminSubscriptionItem): {
  label: string; className: string;
} {
  const expired = item.endUtc && item.endUtc.getTime() <= Date.now()
    && item.planCode !== "FREE";
  if (expired || item.subscriptionStatus === "EXPIRED") {
    return { label: "منتهي", className: "bg-destructive-soft text-destructive" };
  }
  if (item.subscriptionStatus === "PAST_DUE") {
    return { label: "متأخر", className: "bg-warning-soft text-warning" };
  }
  if (item.subscriptionStatus === "TRIALING") {
    return { label: "تجربة", className: "bg-info-soft text-info" };
  }
  if (item.subscriptionStatus === "ACTIVE") {
    return { label: item.planCode === "FREE" ? "مجاني" : "نشط", className: "bg-success-soft text-success" };
  }
  if (item.subscriptionStatus === "CANCELED") {
    return { label: "ملغي", className: "bg-surface text-muted-foreground" };
  }
  return { label: "غير مفعّل", className: "bg-surface text-muted-foreground" };
}

const filters = [
  ["ALL", "الكل"],
  ["PAID", "مدفوعة نشطة"],
  ["PRIVATE", "Unlimited الخاصة"],
  ["FREE", "مجانية"],
  ["TRIAL", "تجريبية"],
  ["PAST_DUE", "متأخرة"],
  ["EXPIRING", "تنتهي قريبًا"],
  ["EXPIRED", "منتهية"],
  ["NO_PLAN", "بدون اشتراك"],
] as const;

function queryUrl(q: string, status: string, page = 1): string {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (status !== "ALL") params.set("status", status);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return "/admin/subscriptions" + (query ? "?" + query : "");
}

export default async function AdminSubscriptionsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; page?: string }>;
}) {
  const admin = await requirePlatformAdmin();
  const canAssign = admin.admin.role === "SUPER_ADMIN";
  const params = await searchParams;
  const status = parseAdminSubscriptionFilter(params.status);
  const parsedPage = Number(params.page ?? 1);
  const result = await listAdminSubscriptions({
    search: params.q,
    status,
    page: Number.isSafeInteger(parsedPage) ? parsedPage : 1,
  });
  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize));

  return (
    <div className="space-y-6 pb-8">
      <section className="relative overflow-hidden rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
        <div className="pointer-events-none absolute -left-20 -top-28 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-5">
          <div className="space-y-2">
            <p className="text-xs font-bold tracking-wide text-primary">SUBSCRIPTION OPERATIONS</p>
            <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">العملاء والاشتراكات</h1>
            <p className="max-w-xl text-sm leading-7 text-muted-foreground">
              كل مساحات العمل وباقاتها وتواريخ تجديدها في مكان واحد. بيانات مباشرة للمتابعة، وإدارة الباقات الخاصة بصلاحية مدير المنصة.
            </p>
          </div>
          <div className="rounded-2xl bg-surface p-4 text-center">
            <p className="text-xs text-muted-foreground">نتائج البحث والتصفية</p>
            <p className="mt-1 text-3xl font-bold tabular-nums">{fmt.format(result.total)}</p>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-4 sm:p-5" aria-label="إدارة الباقة الخاصة">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-bold"><span dir="ltr">DRVO Unlimited ∞</span></h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">باقة خاصة بدون رسوم أو تاريخ انتهاء، تُفعّل لكل نشاط على حدة وليست ضمن الباقات العامة.</p>
            <p className="mt-2 text-sm font-semibold">{canAssign ? "ابحث عن النشاط بالاسم ثم استخدم زر تفعيل Unlimited بجوار بياناته." : "حسابك يملك صلاحية الاطلاع فقط على الباقة الخاصة. التفعيل والإلغاء يتطلبان صلاحية SUPER_ADMIN."}</p>
          </div>
          <Link href={queryUrl("", "PRIVATE")} className="inline-flex min-h-10 items-center rounded-lg border border-input px-3 text-sm font-bold text-primary hover:bg-surface">عرض الأنشطة المفعّلة</Link>
        </div>
      </section>
      <section className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
        <form method="GET" action="/admin/subscriptions" className="flex flex-col gap-3 sm:flex-row">
          {status !== "ALL" ? <input type="hidden" name="status" value={status} /> : null}
          <label htmlFor="subscription-search" className="sr-only">ابحث عن اسم النشاط أو رابطه</label>
          <input
            id="subscription-search"
            name="q"
            defaultValue={result.search}
            placeholder="ابحث باسم النشاط أو الرابط..."
            maxLength={80}
            className="min-h-11 min-w-0 flex-1 rounded-xl border border-input bg-card px-4 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25"
          />
          <button type="submit" className="min-h-11 rounded-xl bg-primary px-6 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
            بحث
          </button>
          {(result.search || status !== "ALL") ? (
            <Link href="/admin/subscriptions" className="flex min-h-11 items-center justify-center rounded-xl border border-input bg-card px-4 text-sm font-bold transition-colors hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">مسح التصفية</Link>
          ) : null}
        </form>
        <div className="mt-4 flex flex-wrap gap-2" aria-label="تصفية حالات الاشتراك">
          {filters.map(([value, label]) => (
            <Link
              key={value}
              href={queryUrl(result.search, value)}
              aria-current={value === status ? "page" : undefined}
              className={value === status
                ? "inline-flex min-h-10 items-center rounded-full bg-primary px-3.5 py-2 text-xs font-bold text-primary-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                 : "inline-flex min-h-10 items-center rounded-full border border-input bg-card px-3.5 py-2 text-xs font-semibold text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"}
            >
              {label}
            </Link>
          ))}
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border p-5">
          <div>
            <h2 className="text-lg font-bold">سجل العملاء والاشتراكات</h2>
            <p className="mt-1 text-xs text-muted-foreground">عرض 25 عميل في كل صفحة · {canAssign ? "إدارة Unlimited متاحة" : "عرض الاشتراكات"}</p>
          </div>
          <Link href="/admin/payments" className="text-sm font-bold text-primary hover:underline">مراجعة المدفوعات ←</Link>
        </div>
        {result.items.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-base font-bold">مفيش نتائج مطابقة</p>
            <p className="mt-2 text-sm text-muted-foreground">غيّر البحث أو حالة الاشتراك وجرب تاني.</p>
          </div>
        ) : (
          <>
          <div className="divide-y divide-border lg:hidden">
            {result.items.map((item) => {
              const itemStatus = statusOf(item);
              const assigned = item.planCode === "PRIVATE_UNLIMITED" && item.subscriptionStatus === "ACTIVE";
              return <article key={item.businessId} className="space-y-3 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="break-words font-bold">{item.name}</p>
                    <p className="mt-1 break-all text-xs text-muted-foreground" dir="ltr">{item.slug}</p>
                    {item.businessStatus !== "ACTIVE" ? <p className="text-xs text-warning">النشاط: {item.businessStatus}</p> : null}
                  </div>
                  <span className={"rounded-full px-3 py-1 text-xs font-bold " + itemStatus.className}>{itemStatus.label}</span>
                </div>
                <dl className="grid grid-cols-2 gap-3 text-sm">
                  <div><dt className="text-xs text-muted-foreground">الباقة الحالية</dt><dd className="mt-1 font-bold">{item.planName ?? "—"}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">سعر الخطة</dt><dd className="mt-1">{item.monthlyPrice === null ? "—" : fmtMoney.format(item.monthlyPrice) + " " + (item.currency ?? "")}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">نهاية الاشتراك</dt><dd className="mt-1">{assigned ? "بدون انتهاء" : date(item.endUtc)}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">تاريخ الانضمام</dt><dd className="mt-1">{date(item.joinedAtUtc)}</dd></div>
                </dl>
                {canAssign ? <PrivateUnlimitedAction businessId={item.businessId} businessName={item.name} assigned={assigned} /> : null}
              </article>;
            })}
          </div>
          <div className="hidden overflow-x-auto lg:block">
            <table className="w-full min-w-[800px] text-right text-sm">
              <thead className="bg-surface text-xs text-muted-foreground">
                <tr>
                  <th scope="col" className="px-5 py-4">النشاط</th>
                  <th scope="col" className="px-4 py-4">الباقة</th>
                  <th scope="col" className="px-4 py-4">الحالة</th>
                  <th scope="col" className="px-4 py-4">سعر الخطة الحالي</th>
                  <th scope="col" className="px-4 py-4">نهاية الاشتراك</th>
                  <th scope="col" className="px-5 py-4">تاريخ الانضمام</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {result.items.map((item) => {
                  const itemStatus = statusOf(item);
                  return (
                    <tr key={item.businessId} className="transition-colors hover:bg-surface/50">
                      <td className="max-w-64 px-5 py-4">
                        <p className="truncate font-bold">{item.name}</p>
                        <p className="mt-1 truncate text-xs text-muted-foreground" dir="ltr">{item.slug}</p>
                        {item.businessStatus !== "ACTIVE" ? <span className="mt-1 inline-block text-xs text-warning">النشاط: {item.businessStatus}</span> : null}
                      </td>
                      <td className="px-4 py-4 font-semibold">{item.planName ?? "—"}
                        {canAssign ? <PrivateUnlimitedAction businessId={item.businessId} businessName={item.name} assigned={item.planCode === "PRIVATE_UNLIMITED" && item.subscriptionStatus === "ACTIVE"} /> : null}
                      </td>
                      <td className="px-4 py-4"><span className={"inline-flex whitespace-nowrap rounded-full px-3 py-1 text-xs font-bold " + itemStatus.className}>{itemStatus.label}</span></td>
                      <td className="whitespace-nowrap px-4 py-4 tabular-nums">
                        {item.monthlyPrice === null ? "—" : fmtMoney.format(item.monthlyPrice) + " " + (item.currency ?? "")}
                      </td>
                      <td className="whitespace-nowrap px-4 py-4">{date(item.endUtc)}</td>
                      <td className="whitespace-nowrap px-5 py-4 text-muted-foreground">{date(item.joinedAtUtc)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          </>
        )}
        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border p-5 text-xs text-muted-foreground">
          <span>صفحة {fmt.format(result.page)} من {fmt.format(totalPages)} — إجمالي {fmt.format(result.total)}</span>
          <div className="flex gap-2">
            {result.page > 1 ? (
              <Link href={queryUrl(result.search, status, result.page - 1)} className="rounded-lg border border-border px-3 py-2 font-bold text-foreground hover:bg-surface">السابق</Link>
            ) : null}
            {result.page < totalPages ? (
              <Link href={queryUrl(result.search, status, result.page + 1)} className="rounded-lg border border-border px-3 py-2 font-bold text-foreground hover:bg-surface">التالي</Link>
            ) : null}
          </div>
        </footer>
      </section>
    </div>
  );
}
