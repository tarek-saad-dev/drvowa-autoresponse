import Link from "next/link";

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
      <section className="relative overflow-hidden rounded-[28px] border border-border bg-card p-6 shadow-sm sm:p-8">
        <div className="pointer-events-none absolute -left-20 -top-28 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-5">
          <div className="space-y-2">
            <p className="text-xs font-black tracking-wide text-primary">SUBSCRIPTION OPERATIONS</p>
            <h1 className="text-2xl font-black tracking-tight sm:text-3xl">العملاء والاشتراكات</h1>
            <p className="max-w-xl text-sm leading-7 text-muted-foreground">
              كل مساحات العمل وباقاتها وتواريخ تجديدها في مكان واحد. بيانات مباشرة للمتابعة، وأي تغيير في اشتراك العميل يتم من نظام الدفع المعتمد.
            </p>
          </div>
          <div className="rounded-2xl bg-surface p-4 text-center">
            <p className="text-xs text-muted-foreground">نتائج البحث والتصفية</p>
            <p className="mt-1 text-3xl font-black tabular-nums">{fmt.format(result.total)}</p>
          </div>
        </div>
      </section>

      <section className="rounded-[22px] border border-border bg-card p-4 shadow-sm sm:p-5">
        <form method="GET" action="/admin/subscriptions" className="flex flex-col gap-3 sm:flex-row">
          {status !== "ALL" ? <input type="hidden" name="status" value={status} /> : null}
          <label htmlFor="subscription-search" className="sr-only">ابحث عن اسم النشاط أو رابطه</label>
          <input
            id="subscription-search"
            name="q"
            defaultValue={result.search}
            placeholder="ابحث باسم النشاط أو الرابط..."
            maxLength={80}
            className="min-h-11 min-w-0 flex-1 rounded-xl border border-input bg-background px-4 text-sm outline-none focus:ring-2 focus:ring-primary/30"
          />
          <button type="submit" className="min-h-11 rounded-xl bg-primary px-6 text-sm font-bold text-primary-foreground transition hover:bg-primary-hover">
            بحث
          </button>
          {(result.search || status !== "ALL") ? (
            <Link href="/admin/subscriptions" className="flex min-h-11 items-center justify-center rounded-xl border border-border px-4 text-sm font-bold hover:bg-surface">مسح التصفية</Link>
          ) : null}
        </form>
        <div className="mt-4 flex flex-wrap gap-2" aria-label="تصفية حالات الاشتراك">
          {filters.map(([value, label]) => (
            <Link
              key={value}
              href={queryUrl(result.search, value)}
              aria-current={value === status ? "page" : undefined}
              className={value === status
                ? "rounded-full bg-primary px-3.5 py-2 text-xs font-bold text-primary-foreground"
                : "rounded-full border border-border bg-surface px-3.5 py-2 text-xs font-semibold text-muted-foreground transition hover:border-primary/40 hover:text-foreground"}
            >
              {label}
            </Link>
          ))}
        </div>
      </section>

      <section className="overflow-hidden rounded-[24px] border border-border bg-card shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border p-5">
          <div>
            <h2 className="text-lg font-black">سجل العملاء والاشتراكات</h2>
            <p className="mt-1 text-xs text-muted-foreground">عرض 25 عميل في كل صفحة · قراءة فقط</p>
          </div>
          <Link href="/admin/payments" className="text-sm font-bold text-primary hover:underline">مراجعة المدفوعات ←</Link>
        </div>
        {result.items.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-base font-black">مفيش نتائج مطابقة</p>
            <p className="mt-2 text-sm text-muted-foreground">غيّر البحث أو حالة الاشتراك وجرب تاني.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
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
                        <p className="truncate font-black">{item.name}</p>
                        <p className="mt-1 truncate text-xs text-muted-foreground" dir="ltr">{item.slug}</p>
                        {item.businessStatus !== "ACTIVE" ? <span className="mt-1 inline-block text-xs text-warning">النشاط: {item.businessStatus}</span> : null}
                      </td>
                      <td className="px-4 py-4 font-semibold">{item.planName ?? "—"}</td>
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
