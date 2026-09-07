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
import { getBusinessById } from "@/modules/businesses/service";
import { listItems } from "@/modules/knowledge/service";
import { listLocations } from "@/modules/locations/service";

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

  const [business, agents, knowledgeItems, locations] = await Promise.all([
    getBusinessById({ businessId }),
    listAgents({ businessId }),
    listItems({ businessId }),
    listLocations({ businessId }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">نظرة عامة</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          ملخص مساحة العمل الحالية وما هو جاهز الآن.
        </p>
      </div>

      <Card className="border-accent/40 bg-[linear-gradient(120deg,color-mix(in_srgb,var(--accent-soft)_70%,white),white)]">
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle>الخطوة التالية: ربط واتساب</CardTitle>
            <Badge variant="warning">المرحلة 2</Badge>
          </div>
          <CardDescription>
            {params.next === "whatsapp"
              ? "تم إكمال الإعداد بنجاح. "
              : ""}
            ربط واتساب والردود الحية سيصلان في المرحلة التالية — هذه البطاقة
            تذكير صادق وليست وظيفة جاهزة.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/dashboard/whatsapp">
            <Button variant="outline">عرض صفحة واتساب</Button>
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

      <Alert variant="info" title="ما هو مفعّل في المرحلة 1">
        إدارة النشاط، الوكيل، المعرفة، والمواقع. صندوق الوارد والمحادثات وواتساب
        مؤجلة بوضوح حتى المرحلة التالية.
      </Alert>
    </div>
  );
}
