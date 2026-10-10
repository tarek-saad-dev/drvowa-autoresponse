"use client";

import Link from "next/link";

import { LandingConversationFlow } from "@/components/landing/conversation-flow";
import { Button } from "@/components/ui/button";

export function LandingHero() {
  return (
    <section className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[42rem] bg-[radial-gradient(circle_at_72%_18%,rgba(0,117,154,.18),transparent_34%),radial-gradient(circle_at_16%_12%,rgba(11,139,181,.11),transparent_30%)]" />

      <div className="mx-auto grid min-h-[calc(100svh-4rem)] max-w-7xl gap-10 px-4 pb-16 pt-12 sm:px-6 sm:pt-16 lg:grid-cols-[0.92fr_1.08fr] lg:items-center lg:gap-14 lg:pb-20 lg:pt-14">
        <div className="relative z-10">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/15 bg-primary/7 px-3 py-1.5 text-[11px] font-black text-primary">
            <span className="h-2 w-2 rounded-full bg-primary shadow-[0_0_0_5px_rgba(0,117,154,.08)]" />
            DRVO AutoRespond
          </div>

          <h1 className="mt-5 max-w-2xl text-4xl font-black leading-[1.14] tracking-[-0.05em] text-foreground sm:text-5xl lg:text-[4rem]">
            مساعدك إنت.
            <span className="block bg-[linear-gradient(90deg,#00759A,#0B8BB5)] bg-clip-text text-transparent">
              بطريقتك.
            </span>
          </h1>

          <p className="mt-5 max-w-xl text-base leading-8 text-muted-foreground sm:text-lg">
            تعلّمه، تحدد صلاحياته، ويتابع معاك. يشتغل على رسائل العملاء،
            يساعد فريقك، ويرجع لك في الحالات اللي محتاجة قرار بشري.
          </p>

          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Link href="/signup">
              <Button size="lg" className="min-w-36 rounded-xl">
                ابدأ الآن
              </Button>
            </Link>
            <Link href="#story">
              <Button size="lg" variant="outline" className="rounded-xl">
                افهم البرنامج
              </Button>
            </Link>
          </div>

          <div className="mt-8 flex flex-wrap gap-2 text-[11px] font-black text-muted-foreground">
            {["للبيزنس", "لشغلك", "ليك شخصيًا"].map((item) => (
              <span
                key={item}
                className="rounded-full border border-border bg-card/75 px-3 py-1.5 shadow-sm backdrop-blur"
              >
                {item}
              </span>
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
