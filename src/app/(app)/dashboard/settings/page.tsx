import Link from "next/link";
import { redirect } from "next/navigation";

import { BusinessSettingsForm } from "@/components/dashboard/business-settings-form";
import { SettingsAccountSection } from "@/components/dashboard/settings-account-section";
import { SettingsWhatsAppConnection } from "@/components/dashboard/settings-whatsapp-connection";
import { resolveActiveBusiness } from "@/lib/tenancy/active-business";
import { requireAuthenticatedUser } from "@/lib/tenancy/require-user";
import { getBusinessById } from "@/modules/businesses/service";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; whatsapp?: string }>;
}) {
  const user = await requireAuthenticatedUser();
  const businessId = await resolveActiveBusiness(user.userId, user.activeBusinessId);
  if (!businessId) redirect("/onboarding");

  const params = await searchParams;
  const account = params.tab === "account";
  const business = account ? null : await getBusinessById({ businessId });

  return (
    <main className="mx-auto w-full max-w-[704px] space-y-5 pb-12" dir="rtl">
      <header className="space-y-1">
        <h1 className="text-2xl font-black tracking-tight sm:text-3xl">الإعدادات</h1>
        <p className="text-sm text-muted-foreground">بيانات نشاطك وحسابك في مكان واحد.</p>
      </header>
      <nav aria-label="أقسام الإعدادات" className="grid grid-cols-2 gap-1 rounded-xl border border-border bg-surface p-1">
        <Link href="/dashboard/settings" aria-current={!account ? "page" : undefined}
          className={"rounded-lg px-3 py-3 text-center text-sm font-bold transition " +
            (!account ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
          النشاط
        </Link>
        <Link href="/dashboard/settings?tab=account" aria-current={account ? "page" : undefined}
          className={"rounded-lg px-3 py-3 text-center text-sm font-bold transition " +
            (account ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
          حسابي
        </Link>
      </nav>

      {account ? (
        <SettingsAccountSection />
      ) : (
        <>
          <SettingsWhatsAppConnection openInitially={params.whatsapp === "1"} />
          {business ? <BusinessSettingsForm key={business.businessId} business={business} /> : null}
          <div className="flex flex-wrap gap-x-5 gap-y-2 border-t border-border pt-4 text-xs font-bold text-muted-foreground">
            <Link href="/dashboard/billing" className="hover:text-primary">الاشتراك والاستخدام ←</Link>
            <Link href="/dashboard/integrations" className="hover:text-primary">التكاملات ←</Link>
            <Link href="/dashboard/reliability" className="hover:text-primary">تشخيص أداء البوت ←</Link>
          </div>
        </>
      )}
    </main>
  );
}
