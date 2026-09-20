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
import Link from "next/link";

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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">الإعدادات</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          بيانات النشاط، الملف الشخصي، والمواقع. تسجيل الخروج من الشريط العلوي.
        </p>
      </div>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>الملف الشخصي</CardTitle>
          <CardDescription>حساب المستخدم الحالي</CardDescription>
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
          <p className="text-xs text-muted-foreground">
            لتغيير كلمة المرور استخدم{" "}
            <Link href="/forgot-password" className="text-primary hover:underline">
              استعادة كلمة المرور
            </Link>
            .
          </p>
        </CardContent>
      </Card>

      <BusinessSettingsForm business={business} />

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>المواقع</CardTitle>
          <CardDescription>
            {locations.length === 0
              ? "لا توجد مواقع بعد."
              : `${locations.length} موقع — أدِرها من صفحة المواقع.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link
            href="/dashboard/locations"
            className="text-sm font-medium text-primary hover:underline"
          >
            فتح المواقع
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
