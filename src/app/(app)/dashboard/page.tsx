import Link from "next/link";
import { redirect } from "next/navigation";
import { ConnectionHealthStrip } from "@/components/dashboard/overview/connection-health-strip";
import { RecentConversations, type OverviewConversation } from "@/components/dashboard/overview/recent-conversations";
import { PulseOverview } from "@/components/dashboard/pulse/pulse-overview";
import { isMissingObjectError } from "@/lib/db";
import { deriveReceptionistStatus } from "@/lib/dashboard/receptionist-status";
import { resolveActiveBusiness } from "@/lib/tenancy/active-business";
import { requireAuthenticatedUser } from "@/lib/tenancy/require-user";
import { listAgents } from "@/modules/agents/service";
import { getWhatsAppAiSetting } from "@/modules/ai";
import { getReceptionistOperationalHealth } from "@/modules/ai/operational-health";
import { getBusinessById } from "@/modules/businesses/service";
import { listItems } from "@/modules/knowledge/service";
import { listInboxConversations } from "@/modules/messaging";
import { getPulseSnapshot } from "@/modules/pulse/report";
import type { PulsePeriod } from "@/modules/pulse/time";

const panel="min-w-0 rounded-[24px] border border-border bg-card p-5 shadow-[0_14px_42px_-34px_rgba(5,43,58,.46)] sm:p-6";
export default async function DashboardOverviewPage({searchParams}:{
 searchParams:Promise<{period?:string;view?:string}>;
}) {
 const params=await searchParams;
 const period:PulsePeriod=params.period==="month"?"month":"today";
 const allReviews=params.view==="reviews";
 const user=await requireAuthenticatedUser();
 const businessId=await resolveActiveBusiness(user.userId,user.activeBusinessId);
 if(!businessId)redirect("/onboarding");
 const [business,agents,knowledgeItems,aiSetting,conversations]=await Promise.all([
  getBusinessById({businessId}),listAgents({businessId}),listItems({businessId}),
  getWhatsAppAiSetting({businessId}),listInboxConversations({businessId,limit:5}),
 ]);
 let pulse:Awaited<ReturnType<typeof getPulseSnapshot>>|null=null;
 try{
  pulse=await getPulseSnapshot({businessId,timezone:business.timezone,period,maxReviews:allReviews?100:12});
 }catch(error){
  if(!isMissingObjectError(error))console.error("[pulse] overview_unavailable",{reason:error instanceof Error?error.name:"UNKNOWN"});
 }
 const activeAgent=agents.find(a=>a.isActive);
 const activeKnowledge=knowledgeItems.filter(item=>item.isActive).length;
 const health=await getReceptionistOperationalHealth({
  businessId,businessName:business.name,autoReplyEnabled:Boolean(aiSetting?.autoReplyEnabled),
  hasActiveAgent:Boolean(activeAgent),hasActiveKnowledge:activeKnowledge>0,
 });
 const status=deriveReceptionistStatus({businessName:business.name,health});
 const recent:OverviewConversation[]=conversations.map(c=>({
  conversationId:c.conversationId,contactDisplayName:c.contactDisplayName,
  contactPhoneNormalized:c.contactPhoneNormalized,lastMessagePreview:c.lastMessagePreview,
  lastMessageAtUtc:c.lastMessageAtUtc,unread:c.unread,
  statusLabel:c.hasOpenEscalation?"متابعة مفتوحة":c.aiMode==="HUMAN_PAUSED"?"مع الفريق":null,
  statusTone:c.hasOpenEscalation?"attention":"neutral",
 }));
 return <div className="mx-auto w-full max-w-[1420px] space-y-5 pb-6 sm:space-y-6">
  <ConnectionHealthStrip initialUiState={health.whatsappLiveState}
   initialInboundHealth={health.inboundHealth} initialInboundIssue={health.inboundIssue} status={status}/>
  <PulseOverview data={pulse} businessName={business.name} allReviews={allReviews}/>
  <section className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(290px,.8fr)]" aria-label="تفاصيل إضافية">
   <RecentConversations conversations={recent} whatsappConnected={health.whatsappLiveState==="READY"}/>
   <div className={panel+" flex flex-col"}>
    <div className="flex items-center justify-between gap-2">
     <h2 className="text-lg font-black">الموظف الذكي</h2>
     <span aria-hidden className="rounded-full bg-primary/10 p-2 text-primary">✦</span>
    </div>
    <p className="mt-5 text-base font-black">{activeAgent?.name||"موظفك الذكي"}</p>
    <p className="mt-1 text-xs text-muted-foreground">{activeAgent?.roleTitle||"مساعد العملاء"} • {activeKnowledge.toLocaleString("en-US")} معلومة نشطة</p>
    <p className="mt-4 text-xs leading-6 text-muted-foreground">{status.kind==="working"?"جاهز للرد على العملاء بالمعلومات اللي اتعلمها.":status.detail}</p>
    <Link href="/dashboard/agent" className="mt-auto block rounded-xl bg-primary px-4 py-3 text-center text-xs font-black text-primary-foreground">إدارة الموظف ←</Link>
   </div>
  </section>
 </div>;
}
