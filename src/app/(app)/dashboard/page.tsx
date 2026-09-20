import Link from "next/link";

import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
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
import { listAgents } from "@/modules/agents/service";
import { getBillingOverview } from "@/modules/billing/service";
import { getBusinessById } from "@/modules/businesses/service";
import { findWhatsAppConnection } from "@/modules/channels/repository";
import { listItems } from "@/modules/knowledge/service";
import { listLocations } from "@/modules/locations/service";
import { getWhatsAppAiSetting } from "@/modules/ai";

export default async function DashboardOverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;
  const user = await requireAuthenticatedUser();
  const businessId = await resolveActiveBusiness(
    user.userId,
    user.activeBusinessId,
  );

  if (!businessId) {
    return null;
  }

  const [business, agents, knowledgeItems, locations, wa, aiSetting, billing] =
    await Promise.all([
      getBusinessById({ businessId }),
      listAgents({ businessId }),
      listItems({ businessId }),
      listLocations({ businessId }),
      findWhatsAppConnection({ businessId }),
      getWhatsAppAiSetting({ businessId }),
      getBillingOverview({ businessId }),
    ]);

  const waLabel = wa
    ? wa.status === "ACTIVE"
      ? "متصل"
      : wa.status
    : "غير مربوط";
  const aiLabel = aiSetting?.autoReplyEnabled ? "مفعّل" : "متوقف";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">نظرة عامة</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          ملخص مساحة العمل الحالية وما يحتاج انتباهك.
        </p>
      </div>

      <Card className="border-accent/40 bg-[linear-gradient(120deg,color-mix(in_srgb,var(--accent-soft)_70%,white),white)]">
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle>
              {wa ? "حالة واتساب والرد الآلي" : "اربط واتساب لبدء الاستقبال"}
            </CardTitle>
            <Badge variant={wa?.status === "ACTIVE" ? "default" : "warning"}>
              {waLabel}
            </Badge>
          </div>
          <CardDescription>
            {params.next === "whatsapp"
              ? "تم إكمال الإعداد. "
              : ""}
            واتساب: {waLabel}. الرد الآلي: {aiLabel}. الخطة:{" "}
            {billing.plan?.displayName ?? "—"}.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Link href="/dashboard/whatsapp">
            <Button variant="outline">إدارة واتساب</Button>
          </Link>
          <Link href="/dashboard/inbox">
            <Button variant="outline">صندوق الوارد</Button>
          </Link>
          <Link href="/dashboard/agent">
            <Button variant="outline">الوكيل</Button>
          </Link>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader>
            <CardDescription>النشاط</CardDescription>
            <CardTitle className="text-lg">{business.name}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {business.category} · {business.countryCode}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>الوكلاء</CardDescription>
            <CardTitle className="text-lg">{agents.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>عناصر المعرفة</CardDescription>
            <CardTitle className="text-lg">{knowledgeItems.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>المواقع</CardDescription>
            <CardTitle className="text-lg">{locations.length}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Alert variant="info" title="ما هو جاهز الآن">
        واتساب، الوارد مع الرد اليدوي، الوكيل، المعرفة، حدود الخطة والاستخدام.
        الدفع الإلكتروني وبوابة الاشتراك المدفوع مؤجلان.
      </Alert>
    </div>
  );
}
