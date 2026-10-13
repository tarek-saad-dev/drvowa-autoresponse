import Link from "next/link";
import type { Plan } from "@/types/domain";
import s from "./landing.module.css";
const publicCodes = ["FREE", "STARTER", "PRO", "BUSINESS"];
const descriptions: Record<string, string> = {
  FREE: "جرّب المساعد على نشاطك",
  STARTER: "لبداية شغل أكثر تنظيمًا",
  PRO: "لرسائل أكتر وفريق بيكبر",
  BUSINESS: "لحجم شغل أكبر وقنوات أكتر",
};
const count = (value: number | null | undefined) =>
  value == null ? "بدون حد محدد" : value.toLocaleString("en-US");
export function PricingCards({ plans }: { plans: Plan[] }) {
  const published = plans
    .filter(
      (p) =>
        publicCodes.includes(p.code) &&
        p.status === "ACTIVE" &&
        p.monthlyPriceAmount != null &&
        Number.isFinite(p.monthlyPriceAmount) &&
        p.monthlyPriceAmount >= 0 &&
        p.currencyCode &&
        p.billingInterval === "MONTHLY",
    )
    .sort((a, b) => publicCodes.indexOf(a.code) - publicCodes.indexOf(b.code));
  if (!published.length)
    return (
      <div className={s.pricingNotice}>
        <p>
          تعذّر تحميل الأسعار حاليًا. تقدر تراجع الباقات داخل حسابك قبل
          الاشتراك.
        </p>
        <Link className={s.secondary} href="/signup">
          إنشاء حساب ←
        </Link>
      </div>
    );
  return (
    <div className={s.pricingGrid}>
      {published.map((plan) => (
        <article
          className={`${s.plan} ${plan.code === "PRO" ? s.featured : ""}`}
          key={plan.code}
        >
          <span className={s.eyebrow}>
            {plan.code === "PRO" ? "مساحة أكبر للنمو" : plan.code}
          </span>
          <h3>{plan.displayName}</h3>
          <p className={s.planDescription}>{descriptions[plan.code]}</p>
          <div className={s.price}>
            <strong dir="ltr">{count(plan.monthlyPriceAmount)}</strong>
            <span>
              {plan.currencyCode === "EGP" ? "جنيه" : plan.currencyCode}
              <small> / شهر</small>
            </span>
          </div>
          <Link
            href="/signup"
            className={
              plan.code === "PRO" || plan.code === "FREE"
                ? s.primary
                : s.secondary
            }
          >
            {plan.code === "FREE"
              ? "ابدأ تجربة مجانية"
              : "ابدأ مع باقة " + plan.displayName}
            <span aria-hidden="true">←</span>
          </Link>
          <ul className={s.planLimits}>
            <li>
              <b>{count(plan.monthlyAiReplies)}</b>
              <span>رد ذكاء اصطناعي / شهر</span>
            </li>
            <li>
              <b>{count(plan.monthlyWhatsAppOutbound)}</b>
              <span>رسالة واتساب صادرة / شهر</span>
            </li>
            <li>
              <b>{count(plan.maxWhatsAppConnections)}</b>
              <span>اتصال واتساب</span>
            </li>
            <li>
              <b>{count(plan.maxAgents)}</b>
              <span>مساعد ذكي</span>
            </li>
            <li>
              <b>{count(plan.maxActiveKnowledgeItems)}</b>
              <span>معلومة نشطة للمساعد</span>
            </li>
          </ul>
        </article>
      ))}
    </div>
  );
}
