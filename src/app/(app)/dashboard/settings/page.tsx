import Link from "next/link";
import { redirect } from "next/navigation";

import { BusinessSettingsForm } from "@/components/dashboard/business-settings-form";
import { Button } from "@/components/ui/button";
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
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <section className="rounded-[28px] border border-border bg-card p-5 shadow-sm sm:p-7">
        <p className="text-xs font-black text-primary">إعدادات البيزنس</p>
        <h1 className="mt-2 text-3xl font-black tracking-[-0.035em]">
          كل الأساسيات في مكان واحد
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-muted-foreground">
          عدّل بيانات النشاط، راجع الفروع، واطمّن على بيانات حسابك من غير ما تدور بين صفحات كتير.
        </p>
      </section>

      <div className="grid gap-5 xl:grid-cols-[1.25fr_.75fr]">
        <div className="space-y-5">
          <section>
            <div className="mb-3">
              <h2 className="text-lg font-black">بيانات النشاط</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                دي المعلومات الأساسية اللي بتظهر في النظام وبيعتمد عليها الفريق.
              </p>
            </div>
            <BusinessSettingsForm business={business} />
          </section>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">الفروع والمواقع</CardTitle>
              <CardDescription>
                {locations.length === 0
                  ? "لسه مضفتش فروع. تقدر تبدأ بفرع واحد وتزود بعدين."
                  : `${locations.length} ${locations.length === 1 ? "فرع مربوط" : "فروع مربوطين"} بالنشاط.`}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="rounded-2xl bg-surface px-4 py-3">
                <p className="text-xs font-bold text-muted-foreground">عدد الفروع</p>
                <p className="mt-1 text-2xl font-black tabular-nums">{locations.length}</p>
              </div>
              <Link href="/dashboard/locations">
                <Button variant="outline">
                  {locations.length === 0 ? "أضف أول فرع" : "إدارة الفروع"}
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">حسابك</CardTitle>
              <CardDescription>
                بيانات الدخول الأساسية المرتبطة بالحساب.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-2xl bg-surface p-4">
                <p className="text-[11px] font-bold text-muted-foreground">الاسم</p>
                <p className="mt-1 text-sm font-black">{user.fullName}</p>
              </div>
              <div className="rounded-2xl bg-surface p-4">
                <p className="text-[11px] font-bold text-muted-foreground">البريد الإلكتروني</p>
                <p dir="ltr" className="mt-1 truncate text-start text-sm font-black">
                  {user.email}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">الأمان</CardTitle>
              <CardDescription>
                لو احتجت تغيّر كلمة المرور، نستخدم مسار الاستعادة الآمن.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link href="/forgot-password">
                <Button variant="outline" className="w-full sm:w-auto">
                  استعادة كلمة المرور
                </Button>
              </Link>
              <p className="mt-3 text-xs leading-5 text-muted-foreground">
                إرسال البريد هيشتغل لما خدمة البريد تتفعّل على الحساب.
              </p>
            </CardContent>
          </Card>

          <Card className="border-primary/15 bg-primary/5">
            <CardContent className="p-5">
              <p className="text-xs font-black text-primary">اختصار مفيد</p>
              <h3 className="mt-2 font-black">عاوز تعدّل طريقة رد الموظف؟</h3>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                إعدادات الشخصية والتعليمات موجودة في صفحة موظف الاستقبال، مش هنا.
              </p>
              <Link href="/dashboard/agent" className="mt-4 inline-block">
                <Button size="sm">افتح موظف الاستقبال</Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
