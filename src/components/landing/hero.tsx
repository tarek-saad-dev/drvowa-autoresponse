import Link from "next/link";

import { Button } from "@/components/ui/button";
import { APP_NAME } from "@/constants/app";

export function LandingHero() {
  return (
    <section className="relative overflow-hidden">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:py-24">
        <div>
          <p className="text-sm font-semibold tracking-wide text-primary">
            {APP_NAME}
          </p>
          <h1 className="mt-4 max-w-xl text-4xl font-bold leading-tight tracking-tight text-foreground sm:text-5xl">
            موظف استقبال ذكي لنشاطك التجاري
          </h1>
          <p className="mt-5 max-w-lg text-base leading-7 text-muted-foreground sm:text-lg">
            منصة SaaS تساعدك على إعداد وكيل ذكاء اصطناعي يرد على عملائك بمعرفة
            نشاطك — مع ربط واتساب في مرحلة لاحقة.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link href="/signup">
              <Button size="lg">ابدأ الآن</Button>
            </Link>
            <Link href="#how-it-works">
              <Button size="lg" variant="outline">
                شاهد كيف يعمل
              </Button>
            </Link>
          </div>
        </div>
        <div
          aria-hidden
          className="relative min-h-64 overflow-hidden rounded-2xl border border-border bg-[linear-gradient(145deg,#0b1f26_0%,#134e4a_55%,#b45309_140%)] shadow-md"
        >
          <div className="absolute inset-0 opacity-40 [background-image:radial-gradient(circle_at_20%_20%,white_0.8px,transparent_1px)] [background-size:18px_18px]" />
          <div className="relative flex h-full flex-col justify-end gap-3 p-6 text-sidebar-foreground sm:p-8">
            <div className="rounded-xl border border-white/15 bg-white/10 p-4 backdrop-blur-sm">
              <p className="text-xs text-sidebar-muted">مثال على الرد</p>
              <p className="mt-2 text-sm leading-6">
                مرحباً، أنا موظف الاستقبال الذكي. كيف يمكنني مساعدتك اليوم؟
              </p>
            </div>
            <div className="ms-auto max-w-[85%] rounded-xl border border-amber-200/20 bg-amber-500/15 p-3 text-sm">
              ما أوقات العمل؟ وأين موقعكم؟
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
