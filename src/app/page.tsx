import Link from "next/link";

import { LandingFooter } from "@/components/landing/footer";
import { LandingHeader } from "@/components/landing/header";
import { LandingHero } from "@/components/landing/hero";
import { PresentationStory3D } from "@/components/landing/presentation-story-3d";
import { Button } from "@/components/ui/button";

export default function HomePage() {
  return (
    <div className="flex min-h-full flex-col">
      <LandingHeader />
      <main className="flex-1">
        <LandingHero />

        <section id="story" className="scroll-mt-24 border-y border-border/55 bg-surface/30 py-8 sm:py-12">
          <div className="mx-auto max-w-7xl px-4 text-center sm:px-6">
            <p className="text-[11px] font-black tracking-[.18em] text-primary">
              01 → 12
            </p>
            <h2 className="mx-auto mt-3 max-w-3xl text-3xl font-black tracking-[-0.04em] text-foreground sm:text-4xl">
              افهم DRVO AutoRespond خطوة بخطوة.
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-sm leading-7 text-muted-foreground sm:text-base">
              نفس ترتيب البريزينتيشن — لكن كرحلة تفاعلية 3D توضح الفكرة من أول
              إعداد المساعد لحد الربط بالـ ERP وإدارة التشغيل اليومي.
            </p>
          </div>
        </section>

        <PresentationStory3D />

        <section className="pb-20 pt-10 sm:pt-14">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <div className="relative overflow-hidden rounded-[36px] border border-white/10 bg-[linear-gradient(125deg,#05090b,#071319_50%,#004a66)] px-6 py-12 text-white shadow-[0_34px_100px_rgba(0,74,102,.26)] sm:px-10 lg:px-12">
              <div className="absolute -left-20 -top-24 h-64 w-64 rounded-full bg-[#0B8BB5]/20 blur-3xl" />
              <div className="relative max-w-2xl">
                <p className="text-xs font-black tracking-[.18em] text-[#42c5eb]">
                  DRVO AUTORESPOND
                </p>
                <h2 className="mt-3 text-3xl font-black tracking-[-0.04em] sm:text-4xl">
                  بمعلوماتك. بطريقتك. تحت إدارتك.
                </h2>
                <p className="mt-4 text-sm leading-7 text-white/65 sm:text-base">
                  ابدأ بمساعد بسيط، علّمه نشاطك، حدد صلاحياته، وبعدها اربطه
                  بأنظمتك كل ما احتجت.
                </p>
                <div className="mt-7">
                  <Link href="/signup">
                    <Button size="lg" className="rounded-xl">
                      ابدأ إعداد مساعدك
                    </Button>
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
      <LandingFooter />
    </div>
  );
}
