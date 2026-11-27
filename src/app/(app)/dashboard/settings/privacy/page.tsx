import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAuthenticatedUser } from "@/lib/tenancy/require-user";
import { resolveActiveBusiness } from "@/lib/tenancy/active-business";
import { getMembership } from "@/modules/businesses/repository";
import { SettingsPrivacyMode } from "@/components/dashboard/settings-privacy-mode";
import { SettingsPrivateContacts } from "@/components/dashboard/settings-private-contacts";
import { PrivacyRetentionPreference } from "@/components/dashboard/privacy-retention-preference";
import { PrivacyWorkspaceReset } from "@/components/dashboard/privacy-workspace-reset";
import { PrivacyCenterSummary } from "@/components/dashboard/privacy-center-summary";
export default async function PrivacyPage(){
 const user=await requireAuthenticatedUser();
 const businessId=await resolveActiveBusiness(user.userId,user.activeBusinessId);
 if(!businessId)redirect("/onboarding");
 const member=await getMembership({userId:user.userId,businessId});
 if(member?.status!=="ACTIVE"||member.role!=="OWNER")redirect("/dashboard/settings");
 return <main dir="rtl" className="mx-auto w-full max-w-[800px] space-y-5 pb-12">
 <Link href="/dashboard/settings" className="text-xs font-bold text-primary">← الإعدادات</Link>
 <header className="space-y-2"><p className="text-xs font-bold text-primary">التحكم في بيانات واتساب</p><h1 className="text-2xl font-black sm:text-3xl">مركز الخصوصية</h1><p className="text-sm text-muted-foreground">حدد ما يمكن لـ DRVO استقباله ومعالجته، وراجع البيانات المحفوظة لنشاطك.</p></header>
 <PrivacyCenterSummary/><PrivacyWorkspaceReset/><PrivacyRetentionPreference/><SettingsPrivacyMode/><SettingsPrivateContacts/>
 <section className="rounded-2xl border border-border bg-card p-4 space-y-2"><h2 className="text-sm font-black">استيراد المحادثات القديمة</h2><p className="text-xs text-muted-foreground">تغيير اختيار الاستيراد عند ربط الرقم. لا يؤدي إيقاف الاستيراد إلى محو السجل الموجود.</p><Link href="/dashboard/settings?whatsapp=1" className="inline-flex rounded-lg border border-border px-3 py-2 text-xs font-bold">إعدادات اتصال واتساب</Link></section>
 </main>;
}
