import { DrvoLoading } from "@/components/ui/drvo-loading";

/** Suspense fallback for dashboard navigation; the persistent shell stays on screen. */
export default function DashboardLoading() {
  return <DrvoLoading label="بنفتح الصفحة…" hint="كل حاجة بتتجهز قدامك." />;
}
