import Link from "next/link";
import type { Plan } from "@/types/domain";
import s from "./landing.module.css";

const publicCodes = ["FREE", "STARTER", "PRO", "BUSINESS"];
const paidCodes = ["STARTER", "PRO", "BUSINESS"];
const descriptions: Record<string, string> = {
  FREE: "جرّب المساعد على نشاطك",
  STARTER: "لبداية شغل أكثر تنظيمًا",
  PRO: "لرسائل أكتر وفريق بيكبر",
  BUSINESS: "لحجم شغل أكبر وقنوات أكتر",
};
const count = (value: number | null | undefined) =>
  value == null ? "بدون حد محدد" : value.toLocaleString("en-US");

function isPublishedPlan(plan: Plan) {
  return (
    publicCodes.includes(plan.code) &&
    plan.status === "ACTIVE" &&
    plan.monthlyPriceAmount != null &&
    Number.isFinite(plan.monthlyPriceAmount) &&
    plan.monthlyPriceAmount >= 0 &&
    Boolean(plan.currencyCode) &&
    plan.billingInterval === "MONTHLY"
  );
}

function PlanLimits({ plan }: { plan: Plan }) {
  return (
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
  );
}

export function PricingCards({ plans }: { plans: Plan[] }) {
  const published = plans
    .filter(isPublishedPlan)
    .sort((a, b) => publicCodes.indexOf(a.code) - publicCodes.indexOf(b.code));
  const paid = published.filter((plan) => paidCodes.includes(plan.code));
  const free = published.find((plan) => plan.code === "FREE");

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
    <div className={s.pricingStack}>
      {paid.length > 0 ? (
        <div className={s.pricingGrid}>
          {paid.map((plan) => (
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
                className={plan.code === "PRO" ? s.primary : s.secondary}
              >
                {"ابدأ مع باقة " + plan.displayName}
                <span aria-hidden="true">←</span>
              </Link>
              <PlanLimits plan={plan} />
            </article>
          ))}
        </div>
      ) : null}

      {free ? (
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
              <span>
                {free.currencyCode === "EGP" ? "جنيه" : free.currencyCode}
                <small> / شهر</small>
              </span>
            </div>
            <p className={s.freePlanLimits}>
              {count(free.monthlyAiReplies)} رد ·{" "}
              {count(free.monthlyWhatsAppOutbound)} رسالة ·{" "}
              {count(free.maxWhatsAppConnections)} واتساب ·{" "}
              {count(free.maxAgents)} مساعد ·{" "}
              {count(free.maxActiveKnowledgeItems)} معلومة
            </p>
          </div>
          <Link href="/signup" className={s.secondary}>
            ابدأ تجربة مجانية
            <span aria-hidden="true">←</span>
          </Link>
        </aside>
      ) : null}
    </div>
  );
}
