import Link from "next/link";

import { LandingFooter } from "@/components/landing/footer";
import { LandingHeader } from "@/components/landing/header";
import { LandingHero } from "@/components/landing/hero";
import { PresentationScrollytelling } from "@/components/landing/presentation-scrollytelling";
import { Button } from "@/components/ui/button";

export default function HomePage() {
  return (
    <div className="flex min-h-full flex-col">
      <LandingHeader />
      <main className="flex-1">
        <LandingHero />

        <section className="border-y border-border/55 bg-surface/30 py-7 sm:py-9">
          <div className="mx-auto max-w-7xl px-4 text-center sm:px-6">
            <p className="text-[11px] font-black tracking-[.18em] text-primary">
              SCROLL TO DISCOVER
            </p>
            <h2 className="mx-auto mt-2 max-w-3xl text-2xl font-black tracking-[-0.04em] text-foreground sm:text-3xl">
              افهمه بصريًا… خطوة ورا خطوة.
            </h2>
          </div>
        </section>

        <PresentationScrollytelling />

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
