import { AdminBrandAssets } from "@/components/admin/admin-brand-assets";
import { requirePlatformAdmin } from "@/modules/platform-admin/service";

export const dynamic = "force-dynamic";

export default async function BrandAssetsPage() {
  await requirePlatformAdmin({ roles: ["SUPER_ADMIN"] });
  return (
    <main className="space-y-6">
      <header className="space-y-2">
        <p className="text-xs font-bold tracking-[0.18em] text-primary" dir="ltr">BRAND / ASSET LIBRARY</p>
        <h1 className="font-display text-2xl font-bold sm:text-3xl">هوية DRVO AutoRespond</h1>
        <p className="max-w-3xl text-sm leading-7 text-muted-foreground">
          هنا تقدر ترفع لوجوهات الهوية الجديدة، تعاين كل Variant، وتعتمد النسخة اللي تظهر لعملائك.
          مفيش نشر تلقائي لمجرد رفع الصورة، وكل نسخة سابقة محفوظة للرجوع ليها.
        </p>
      </header>
      <AdminBrandAssets />
    </main>
  );
}
