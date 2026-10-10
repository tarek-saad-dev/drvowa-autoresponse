"use client";

import Link from "next/link";

import { LandingConversationFlow } from "@/components/landing/conversation-flow";
import { Button } from "@/components/ui/button";

export function LandingHero() {
  return (
    <section className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[36rem] bg-[radial-gradient(circle_at_72%_18%,rgba(0,117,154,.16),transparent_34%),radial-gradient(circle_at_16%_12%,rgba(11,139,181,.10),transparent_30%)]" />

      <div className="mx-auto grid max-w-7xl gap-10 px-4 pb-16 pt-12 sm:px-6 sm:pt-16 lg:grid-cols-[0.92fr_1.08fr] lg:items-center lg:gap-14 lg:pb-24 lg:pt-20">
        <div className="relative z-10">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/15 bg-primary/7 px-3 py-1.5 text-[11px] font-black text-primary">
            <span className="h-2 w-2 rounded-full bg-primary shadow-[0_0_0_5px_rgba(0,117,154,.08)]" />
            AI Receptionist + WhatsApp + ERP
          </div>

          <h1 className="mt-5 max-w-2xl text-4xl font-black leading-[1.16] tracking-[-0.045em] text-foreground sm:text-5xl lg:text-[3.8rem]">
            كل رسالة داخلة،
            <span className="block bg-[linear-gradient(90deg,#00759A,#0B8BB5)] bg-clip-text text-transparent">
              تتحول لتصرف.
            </span>
          </h1>

          <p className="mt-5 max-w-xl text-base leading-8 text-muted-foreground sm:text-lg">
            DRVO AutoRespond يفهم العميل، يرد من معرفة نشاطك، ينفّذ من الـ ERP،
            ويسلّم المحادثة للموظف وقت ما تحتاج.
          </p>

          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Link href="/signup">
              <Button size="lg" className="min-w-36 rounded-xl">
                ابدأ الآن
              </Button>
            </Link>
            <Link href="#how-it-works">
              <Button size="lg" variant="outline" className="rounded-xl">
                شوف بيشتغل إزاي
              </Button>
            </Link>
          </div>

          <div className="mt-8 grid max-w-xl grid-cols-3 gap-2">
            {[
              ["24/7", "رد تلقائي"],
              ["AI + Human", "استلام ذكي"],
              ["ERP", "قراءة وتنفيذ"],
            ].map(([value, label]) => (
              <div
                key={value}
                className="rounded-2xl border border-border/70 bg-card/60 px-3 py-3 backdrop-blur"
              >
                <div className="text-sm font-black text-foreground">{value}</div>
                <div className="mt-0.5 text-[10px] font-bold text-muted-foreground">{label}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="relative">
          <div className="absolute inset-8 -z-10 rounded-full bg-primary/10 blur-3xl" />
          <LandingConversationFlow />
        </div>
      </div>
    </section>
  );
}
