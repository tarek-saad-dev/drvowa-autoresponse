"use client";

import { useState } from "react";
import Link from "next/link";
import type { Plan } from "@/types/domain";
import s from "./landing.module.css";

type ReplyAddon = { quantity: number; priceEgp: number; validDays: number };
type PricingCardsProps = {
  plans: Plan[];
  annualPrices?: Record<string, number> | null;
  freeTrialEnabled?: boolean;
  replyAddons?: ReplyAddon[];
};

const publicCodes = ["FREE", "STARTER", "PRO", "BUSINESS"] as const;
const paidCodes = ["STARTER", "PRO", "BUSINESS"] as const;
const descriptions: Record<string, string> = {
  FREE: "تجربة بسيطة عشان تتعرّف على المساعد",
  STARTER: "لأول خطوة في تنظيم رسائل عملائك",
  PRO: "لفريق بيكبر ومحادثات أكتر",
  BUSINESS: "لشغل أكبر وحجم رسائل أعلى",
};

const count = (value: number | null | undefined) =>
  value == null ? "بدون حد محدد" : value.toLocaleString("en-US");
const money = (value: number) => value.toLocaleString("en-US");

function isPublishedPlan(plan: Plan) {
  return (
    publicCodes.includes(plan.code as (typeof publicCodes)[number]) &&
    plan.status === "ACTIVE" &&
    plan.monthlyPriceAmount != null &&
    Number.isFinite(plan.monthlyPriceAmount) &&
    plan.monthlyPriceAmount >= 0 &&
    Boolean(plan.currencyCode) &&
    plan.billingInterval === "MONTHLY"
  );
}

function PlanLimits({ plan, freeTrialEnabled }: { plan: Plan; freeTrialEnabled: boolean }) {
  const trial = plan.code === "FREE" && freeTrialEnabled;
  return (
    <ul className={s.planLimits}>
      <li><b>{count(plan.monthlyAiReplies)}</b><span>{trial ? "رد AI للتجربة مرة واحدة" : "رد AI / شهر"}</span></li>
      <li><b>{count(plan.monthlyWhatsAppOutbound)}</b><span>رسالة واتساب صادرة / شهر</span></li>
      <li><b>{count(plan.maxWhatsAppConnections)}</b><span>رقم واتساب</span></li>
      <li><b>{count(plan.maxAgents)}</b><span>مساعد ذكي</span></li>
      <li><b>{count(plan.maxActiveKnowledgeItems)}</b><span>معلومة نشطة</span></li>
    </ul>
  );
}

export function PricingCards({
  plans,
  annualPrices = null,
  freeTrialEnabled = false,
  replyAddons = [],
}: PricingCardsProps) {
  const [interval, setInterval] = useState<"MONTHLY" | "ANNUAL">("MONTHLY");
  const published = plans
    .filter(isPublishedPlan)
    .sort((a, b) => publicCodes.indexOf(a.code as (typeof publicCodes)[number]) -
      publicCodes.indexOf(b.code as (typeof publicCodes)[number]));
  const paid = published.filter((plan) => paidCodes.includes(plan.code as (typeof paidCodes)[number]));
  const free = published.find((plan) => plan.code === "FREE");
  const hasAnnual = paid.length > 0 && paid.every((p) => {
    const yearly = annualPrices?.[p.code];
    return p.currencyCode === "EGP" && typeof yearly === "number" &&
      Number.isFinite(yearly) && yearly > 0;
  });
  const annually = hasAnnual && interval === "ANNUAL";
  const trial = Boolean(free && freeTrialEnabled);

  if (!published.length) {
    return (
      <div className={s.pricingNotice}>
        <p>تعذّر تحميل الأسعار حاليًا. تقدر تراجع الباقات داخل حسابك قبل الاشتراك.</p>
        <Link className={s.secondary} href="/signup">إنشاء حساب ←</Link>
      </div>
    );
  }

  const comparison = [
    { label: "ردود الذكاء الاصطناعي", value: (p: Plan) =>
      p.code === "FREE" && trial ? count(p.monthlyAiReplies) + " مرة واحدة" : count(p.monthlyAiReplies) + " / شهر" },
    { label: "رسائل واتساب الصادرة / شهر", value: (p: Plan) => count(p.monthlyWhatsAppOutbound) },
    { label: "أرقام واتساب", value: (p: Plan) => count(p.maxWhatsAppConnections) },
    { label: "المساعدون الأذكياء", value: (p: Plan) => count(p.maxAgents) },
    { label: "المعلومات النشطة", value: (p: Plan) => count(p.maxActiveKnowledgeItems) },
    { label: "إضافات ردود مدفوعة", value: (p: Plan) =>
      p.code === "FREE" || replyAddons.length === 0 ? "—" : "متاحة" },
  ];

  return (
    <div className={s.pricingStack}>
      {paid.length > 0 && (
        <>
          <div className={s.pricingToolbar}>
            <p>سعر واضح، وحدود استخدام واضحة. اختار اللي يناسب حجم شغلك.</p>
            {hasAnnual && (
              <div className={s.billingSwitch} role="group" aria-label="مدة الاشتراك">
                <button type="button" aria-pressed={!annually}
                  className={!annually ? s.billingSwitchActive : ""}
                  onClick={() => setInterval("MONTHLY")}>شهري</button>
                <button type="button" aria-pressed={annually}
                  className={annually ? s.billingSwitchActive : ""}
                  onClick={() => setInterval("ANNUAL")}>
                  سنوي <span className={s.savePill}>وفّر شهرين</span>
                </button>
              </div>
            )}
          </div>

          <div className={s.pricingGrid}>
            {paid.map((plan) => {
              const annualAmount = annualPrices?.[plan.code];
              const amount = annually && annualAmount != null ? annualAmount : Number(plan.monthlyPriceAmount);
              const saving = annualAmount == null ? 0 : Number(plan.monthlyPriceAmount) * 12 - annualAmount;
              return (
                <article className={s.plan + (plan.code === "PRO" ? " " + s.featured : "")} key={plan.code}>
                  <div className={s.planTopline}>
                    <span className={s.eyebrow}>{plan.code}</span>
                    {plan.code === "PRO" && <span className={s.recommendedPill}>مناسب للنمو</span>}
                  </div>
                  <h3>{plan.displayName}</h3>
                  <p className={s.planDescription}>{descriptions[plan.code]}</p>
                  <div className={s.price}>
                    <strong dir="ltr">{money(amount)}</strong>
                    <span>جنيه<small>{annually ? " / سنة" : " / شهر"}</small></span>
                  </div>
                  <div className={s.planBillingNote}>
                    {annually
                      ? <span>دفعة سنوية واحدة · <b>وفّر {money(saving)} جنيه</b></span>
                      : <span>اشتراك شهري{hasAnnual && annualAmount != null
                        ? " · أو " + money(annualAmount) + " جنيه سنويًا" : " · جدّد حسب احتياجك"}</span>}
                  </div>
                  <Link href="/signup" className={plan.code === "PRO" ? s.primary : s.secondary}>
                    ابدأ مع {plan.displayName}<span aria-hidden="true">←</span>
                  </Link>
                  <PlanLimits plan={plan} freeTrialEnabled={freeTrialEnabled} />
                </article>
              );
            })}
          </div>
        </>
      )}

      {free && (
        <aside className={s.freePlanRow} aria-label="الخطة المجانية">
          <div className={s.freePlanCopy}>
            <span className={s.eyebrow}>FREE</span>
            <div>
              <h3>{free.displayName}</h3>
              <p>{descriptions.FREE}</p>
            </div>
          </div>
          <div className={s.freePlanMeta}>
            <div className={s.freePlanPrice}>
              <strong dir="ltr">{count(free.monthlyPriceAmount)}</strong>
              <span>جنيه</span>
            </div>
            <p className={s.freePlanLimits}>
              {count(free.monthlyAiReplies)} رد{trial ? " مرة واحدة خلال 7 أيام" : " / شهر"} ·{" "}
              {count(free.maxWhatsAppConnections)} واتساب ·{" "}
              {count(free.maxAgents)} مساعد ·{" "}
              {count(free.maxActiveKnowledgeItems)} معلومة
            </p>
          </div>
          <Link href="/signup" className={s.secondary}>
            ابدأ تجربة مجانية<span aria-hidden="true">←</span>
          </Link>
        </aside>
      )}

      <section className={s.comparisonShell} aria-label="مقارنة الباقات بالتفصيل">
        <div className={s.comparisonHeading}>
          <div>
            <span className={s.eyebrow}>كل التفاصيل في مكان واحد</span>
            <h3>قارن الباقات براحتك</h3>
            <p>الحدود الفعلية لكل باقة، من غير مزايا مخفية أو وعود مش مفعّلة.</p>
          </div>
          <span className={s.compareHint}>اسحب الجدول للمقارنة على الموبايل</span>
        </div>
        <div className={s.compareScroll} tabIndex={0} role="region" aria-label="جدول مقارنة الأسعار وحدود الاستخدام">
          <table className={s.comparisonTable}>
            <thead>
              <tr>
                <th scope="col">الميزة</th>
                {published.map((p) =>
                  <th scope="col" key={p.code} className={p.code === "PRO" ? s.compareFeatured : ""}>
                    <span>{p.displayName}</span>
                    {p.code === "PRO" && <small>مناسب للنمو</small>}
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">سعر {annually ? "السنة" : "الشهر"}</th>
                {published.map((p) =>
                  <td key={p.code} className={p.code === "PRO" ? s.compareFeatured : ""}>
                    <strong dir="ltr">{money(annually && p.code !== "FREE" && annualPrices?.[p.code] != null
                      ? annualPrices[p.code] : Number(p.monthlyPriceAmount))}</strong> ج
                  </td>
                )}
              </tr>
              {annually && (
                <tr>
                  <th scope="row">التوفير السنوي</th>
                  {published.map((p) =>
                    <td key={p.code} className={p.code === "PRO" ? s.compareFeatured : ""}>
                      {p.code === "FREE" ? "—" : money(Number(p.monthlyPriceAmount) * 12 - Number(annualPrices?.[p.code])) + " ج"}
                    </td>
                  )}
                </tr>
              )}
              {comparison.map((item) =>
                <tr key={item.label}>
                  <th scope="row">{item.label}</th>
                  {published.map((p) =>
                    <td key={p.code} className={p.code === "PRO" ? s.compareFeatured : ""}>{item.value(p)}</td>
                  )}
                </tr>
              )}
              {trial && (
                <tr>
                  <th scope="row">مدة التجربة المجانية</th>
                  {published.map((p) =>
                    <td key={p.code} className={p.code === "PRO" ? s.compareFeatured : ""}>
                      {p.code === "FREE" ? "7 أيام من التفعيل" : "—"}
                    </td>
                  )}
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className={s.comparisonFootnote}>
          {annually ? "الاشتراك السنوي يُدفع مقدمًا، وحدود الردود تتجدد كل شهر." :
            "الأرقام توضح حدود الاستخدام في الباقة الحالية."}{" "}
          {trial ? "الخطة المجانية: 30 ردًا إجمالًا خلال 7 أيام، وليست 30 ردًا شهريًا." : ""}
        </p>
      </section>

      {replyAddons.length > 0 && paid.length > 0 && (
        <div className={s.addonStrip}>
          <div>
            <b>محتاج ردود أكتر؟</b>
            <p>أضف رصيدًا على باقتك المدفوعة، صالحًا لمدة 30 يومًا من الاعتماد.</p>
          </div>
          <div className={s.addonChips}>
            {replyAddons.map((addon) =>
              <span key={addon.quantity}>{money(addon.quantity)} رد · {money(addon.priceEgp)} ج</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
