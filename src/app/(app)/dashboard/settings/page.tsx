import Link from "next/link";
import { redirect } from "next/navigation";

import { OwnerEscalationSettings } from "@/components/dashboard/owner-escalation-settings";
import { BusinessSettingsForm } from "@/components/dashboard/business-settings-form";
import { isMissingObjectError } from "@/lib/db";
import { resolveActiveBusiness } from "@/lib/tenancy/active-business";
import { requireAuthenticatedUser } from "@/lib/tenancy/require-user";
import { getMembership } from "@/modules/businesses/repository";
import { getBusinessById } from "@/modules/businesses/service";
import { getEscalationSetting } from "@/modules/escalations/service";
import { listLocations } from "@/modules/locations/service";

export default async function SettingsPage() {
  const user = await requireAuthenticatedUser();
  const businessId = await resolveActiveBusiness(
    user.userId,
    user.activeBusinessId,
  );
  if (!businessId) redirect("/onboarding");

  const [business, locations, membership] = await Promise.all([
    getBusinessById({ businessId }),
    listLocations({ businessId }),
    getMembership({ businessId, userId: user.userId }),
  ]);

  const canManageEscalation =
    membership?.status === "ACTIVE" &&
    ["OWNER", "ADMIN"].includes(membership.role);
  let escalationSetting = null;
  let escalationSettingsUnavailable = false;
  if (canManageEscalation) {
    try {
      escalationSetting = await getEscalationSetting(businessId);
    } catch (error) {
      if (!isMissingObjectError(error)) throw error;
      console.error("[dashboard/settings] Escalation settings table missing; check schema migrations.");
      escalationSettingsUnavailable = true;
    }
  }

  return (
    <main className="mx-auto w-full max-w-3xl space-y-5 pb-10">
      <header className="space-y-1">
        <h1 className="text-2xl font-black tracking-tight sm:text-3xl">
          إعدادات النشاط
        </h1>
        <p className="text-sm leading-6 text-muted-foreground">
          عدّل بيانات نشاطك والفروع والتنبيهات المرتبطة بيه.
        </p>
      </header>

      <BusinessSettingsForm key={business.businessId} business={business} />

      <Link
        href="/dashboard/locations"
        className="group flex items-center justify-between gap-4 rounded-2xl border border-border bg-card p-4 transition-colors hover:border-primary/30 hover:bg-surface/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 sm:p-5"
      >
        <div className="min-w-0">
          <h2 className="text-sm font-black">الفروع والمواقع</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {locations.length === 0
              ? "لسه مفيش فروع مضافة"
              : locations.length === 1
                ? "فرع واحد مرتبط بالنشاط"
                : `${locations.length} فروع مرتبطة بالنشاط`}
          </p>
        </div>
        <span className="shrink-0 text-sm font-bold text-primary group-hover:underline">
          {locations.length === 0 ? "إضافة فرع" : "إدارة الفروع"} ←
        </span>
      </Link>

      {escalationSetting ? (
        <details className="group overflow-hidden rounded-2xl border border-border bg-card">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-4 marker:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/40 sm:p-5 [&::-webkit-details-marker]:hidden">
            <span className="block min-w-0">
              <span className="block text-sm font-black">تنبيهات التدخل البشري</span>
              <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                إشعار مسؤول النشاط لما محادثة تحتاج تدخل إنسان
              </span>
            </span>
            <span className="flex shrink-0 items-center gap-2 text-xs font-bold text-muted-foreground">
              إدارة
              <span aria-hidden="true" className="inline-block transition-transform group-open:rotate-90">
                ‹
              </span>
            </span>
          </summary>
          <div className="border-t border-border px-4 py-5 sm:px-5">
            <OwnerEscalationSettings initial={escalationSetting} />
          </div>
        </details>
      ) : null}

      {escalationSettingsUnavailable ? (
        <p role="status" className="rounded-xl border border-border px-4 py-3 text-xs text-muted-foreground">
          إعدادات تنبيهات التدخل البشري غير متاحة حاليًا. باقي إعدادات النشاط شغّالة.
        </p>
      ) : null}
    </main>
  );
}
