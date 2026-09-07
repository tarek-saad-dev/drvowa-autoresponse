import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export function DeferredState({
  title,
  description,
  badge = "المرحلة التالية",
}: {
  title: string;
  description: string;
  badge?: string;
}) {
  return (
    <Card className="border-dashed">
      <CardHeader>
        <div className="flex items-center gap-2">
          <CardTitle>{title}</CardTitle>
          <Badge variant="warning">{badge}</Badge>
        </div>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          هذه الصفحة جاهزة شكلياً ولن تُفعَّل وظائفها قبل اكتمال المرحلة المناسبة.
        </p>
      </CardContent>
    </Card>
  );
}
