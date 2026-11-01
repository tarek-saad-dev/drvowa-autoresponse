import { AdminDiscountCodes } from "@/components/admin/admin-discount-codes";
import { requirePlatformAdmin } from "@/modules/platform-admin/service";
export const dynamic="force-dynamic";
export default async function DiscountCodesPage(){
  await requirePlatformAdmin();
  return <main className="space-y-6">
    <header><p className="text-xs font-semibold text-primary">PRICING / DISCOUNTS</p>
      <h1 className="mt-1 text-2xl font-bold">أكواد الخصم</h1>
      <p className="mt-2 text-sm text-muted-foreground">إنشاء أكواد عروض للاشتراكات الشهرية والسنوية، مع متابعة الاستخدام وإيقاف الأكواد.</p>
    </header>
    <AdminDiscountCodes />
  </main>;
}
