import Link from "next/link";

import { BusinessSettingsForm } from "@/components/dashboard/business-settings-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { resolveActiveBusiness } from "@/lib/tenancy/active-business";
import { requireAuthenticatedUser } from "@/lib/tenancy/require-user";
import { getBusinessById } from "@/modules/businesses/service";
import { listLocations } from "@/modules/locations/service";
import { redirect } from "next/navigation";

export default async function SettingsPage() {
  const user = await requireAuthenticatedUser();
  const businessId = await resolveActiveBusiness(
    user.userId,
    user.activeBusinessId,
  );
  if (!businessId) redirect("/onboarding");

  const [business, locations] = await Promise.all([
    getBusinessById({ businessId }),
    listLocations({ businessId }),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">الإعدادات</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          النشاط، الحساب، والأمان. تسجيل الخروج من الشريط العلوي.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-base font-semibold">النشاط</h2>
        <BusinessSettingsForm business={business} />
        <Card className="max-w-2xl">
          <CardHeader>
            <CardTitle>المواقع</CardTitle>
            <CardDescription>
              {locations.length === 0
                ? "لا توجد مواقع بعد."
                : `${locations.length} موقع مرتبط بنشاطك.`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link
              href="/dashboard/locations"
              className="text-sm font-medium text-primary hover:underline"
            >
              إدارة المواقع
            </Link>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold">الحساب</h2>
        <Card className="max-w-2xl">
          <CardHeader>
            <CardTitle>الملف الشخصي</CardTitle>
            <CardDescription>بيانات تسجيل الدخول (للعرض فقط حالياً)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              <span className="text-muted-foreground">الاسم: </span>
              {user.fullName}
            </p>
            <p dir="ltr" className="text-start">
              <span className="text-muted-foreground">البريد: </span>
              {user.email}
            </p>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold">الأمان</h2>
        <Card className="max-w-2xl">
          <CardHeader>
            <CardTitle>كلمة المرور</CardTitle>
            <CardDescription>
              لإعادة تعيين كلمة المرور نرسل رابطاً آمناً إلى بريدك (عند تفعيل
              إرسال البريد).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link
              href="/forgot-password"
              className="text-sm font-medium text-primary hover:underline"
            >
              طلب استعادة كلمة المرور
            </Link>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
