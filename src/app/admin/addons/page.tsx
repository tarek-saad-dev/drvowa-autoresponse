import { AdminAddonReviews } from "@/components/admin/admin-addon-reviews";
import { requirePlatformAdmin } from "@/modules/platform-admin/service";
import { redirect } from "next/navigation";
export const dynamic="force-dynamic";
export default async function AdminAddonOrdersPage(){
 await requirePlatformAdmin();
 if(process.env.NODE_ENV==="production" || process.env.DRVO_PRICING_V1_ADDON_DRAFTS!=="true") redirect("/admin/payments");
 return <main className="space-y-4"><h1 className="text-2xl font-bold">طلبات الإضافات</h1><AdminAddonReviews /></main>;
}
