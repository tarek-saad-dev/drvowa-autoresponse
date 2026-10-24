import Link from "next/link";
import { redirect } from "next/navigation";

import { LogoutButton } from "@/components/dashboard/logout-button";
import { WorkspaceSwitcher } from "@/components/dashboard/workspace-switcher";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { resolveActiveBusiness } from "@/lib/tenancy/active-business";
import { requireAuthenticatedUser } from "@/lib/tenancy/require-user";
import { listBusinessesForUser } from "@/modules/businesses/service";
import { isPlatformAdminUser } from "@/modules/platform-admin/service";

export async function SettingsAccountSection() {
  const user = await requireAuthenticatedUser();
  const businesses = await listBusinessesForUser(user.userId);
  if (businesses.length === 0) redirect("/choose-plan");

  const activeBusinessId = await resolveActiveBusiness(
    user.userId,
    user.activeBusinessId,
  );
  const showPlatformAdmin = await isPlatformAdminUser(user.userId);

  return (
    <div className="mx-auto w-full max-w-xl space-y-5">
      <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
        <div>
          <p className="text-[11px] font-bold text-muted-foreground">الاسم</p>
          <p className="mt-1 text-sm font-black">{user.fullName}</p>
        </div>
        <div>
          <p className="text-[11px] font-bold text-muted-foreground">البريد الإلكتروني</p>
          <p dir="ltr" className="mt-1 truncate text-start text-sm font-black">
            {user.email}
          </p>
        </div>
      </section>

      <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-black">مساحة العمل</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              بدّل بين الأنشطة المرتبطة بحسابك
            </p>
          </div>
          <WorkspaceSwitcher
            businesses={businesses}
            activeBusinessId={activeBusinessId}
          />
        </div>
      </section>

      <section className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4">
        <div>
          <p className="text-sm font-black">المظهر</p>
          <p className="mt-0.5 text-xs text-muted-foreground">فاتح أو داكن</p>
        </div>
        <ThemeToggle />
      </section>

      <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
        <Link href="/forgot-password" className="block text-sm font-bold text-muted-foreground">
          استعادة كلمة المرور
        </Link>
        {showPlatformAdmin ? (
          <Link href="/admin" className="block text-sm font-bold text-primary">
            إدارة المنصة
          </Link>
        ) : null}
      </section>

      <LogoutButton className="w-full sm:w-auto" />
    </div>
  );
}
