"use client";

import Link from "next/link";

import { LandingConversationFlow } from "@/components/landing/conversation-flow";
import { Button } from "@/components/ui/button";

export function LandingHero() {
  return (
    <section className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[42rem] bg-[radial-gradient(circle_at_72%_18%,rgba(0,117,154,.18),transparent_34%),radial-gradient(circle_at_16%_12%,rgba(11,139,181,.11),transparent_30%)]" />

      <div className="mx-auto grid max-w-7xl gap-7 px-4 pb-10 pt-8 sm:min-h-[calc(100svh-4rem)] sm:gap-10 sm:px-6 sm:pb-16 sm:pt-16 lg:grid-cols-[0.88fr_1.12fr] lg:items-center lg:gap-10 lg:px-8 lg:pb-16 lg:pt-10 xl:grid-cols-[0.82fr_1.18fr] xl:gap-16 xl:pb-20 xl:pt-14 2xl:max-w-[1480px]">
        <div className="relative z-10">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/15 bg-primary/7 px-3 py-1.5 text-[11px] font-black text-primary">
            <span className="h-2 w-2 rounded-full bg-primary shadow-[0_0_0_5px_rgba(0,117,154,.08)]" />
            DRVO AutoRespond
          </div>

          <h1 className="mt-4 max-w-2xl text-[2.65rem] font-black leading-[1.02] tracking-[-0.055em] text-foreground sm:mt-5 sm:text-5xl sm:leading-[1.14] lg:text-[3.55rem] lg:leading-[1.06] xl:text-[4.25rem] 2xl:text-[4.7rem]">
            مساعدك إنت.
            <span className="block bg-[linear-gradient(90deg,#00759A,#0B8BB5)] bg-clip-text text-transparent">
              بطريقتك.
            </span>
          </h1>

          <p className="mt-4 max-w-xl text-[15px] leading-7 text-muted-foreground sm:mt-5 sm:text-lg sm:leading-8 lg:max-w-[34rem] xl:text-[1.18rem] xl:leading-9">
            تعلّمه، تحدد صلاحياته، ويتابع معاك. يشتغل على رسائل العملاء،
            يساعد فريقك، ويرجع لك في الحالات اللي محتاجة قرار بشري.
          </p>

          <div className="mt-6 grid grid-cols-1 gap-2.5 min-[390px]:grid-cols-2 sm:mt-7 sm:flex sm:flex-wrap sm:items-center sm:gap-3">
            <Link href="/signup">
              <Button size="lg" className="w-full rounded-xl sm:min-w-36">
                ابدأ الآن
              </Button>
            </Link>
            <Link href="#story">
              <Button size="lg" variant="outline" className="w-full rounded-xl sm:w-auto">
                افهم البرنامج
              </Button>
            </Link>
          </div>

          <div className="mt-5 flex flex-wrap gap-1.5 text-[10px] font-black text-muted-foreground sm:mt-8 sm:gap-2 sm:text-[11px]">
            {["للبيزنس", "لشغلك", "ليك شخصيًا"].map((item) => (
              <span
                key={item}
                className="rounded-full border border-border bg-card/75 px-2.5 py-1.5 shadow-sm backdrop-blur sm:px-3"
              >
                {item}
              </span>
            ))}
          </div>
        </div>

        <div className="relative lg:min-w-0">
          <div className="absolute inset-8 -z-10 rounded-full bg-primary/10 blur-3xl" />
          <div className="lg:origin-center lg:scale-[0.96] xl:scale-100 2xl:scale-[1.04]">
            <LandingConversationFlow />
          </div>
        </div>
      </div>
    </section>
  );
}
