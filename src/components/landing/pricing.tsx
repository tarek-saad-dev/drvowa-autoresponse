import { unstable_cache } from "next/cache";
import { connection } from "next/server";
import { listActivePlans } from "@/modules/billing/repository";
import type { Plan } from "@/types/domain";
import { getPricingV1Plan, PRICING_V1_ADDONS } from "@/modules/pricing/pricing-v1-catalog";
import { isPricingV1PaymentEnabled, quotePricingV1 } from "@/modules/pricing/payment-quote";
import { PricingCards } from "./pricing-cards";
// Cache successful catalog reads only. Never replace unavailable prices with guessed amounts.
const catalog = unstable_cache(
  () => listActivePlans(),
  ["landing-public-plans-v1"],
  { revalidate: 60 },
);
export async function LandingPricing() {
  await connection();
  let plans: Plan[] = [];
  try {
    plans = await catalog();
  } catch {
    /* Keep the landing available when the catalog cannot be reached. */
  }
  // Annual prices come from the same server quote used by checkout.
  // Hide annual offers if the live monthly plan disagrees with Pricing V1.
  const annualPrices = isPricingV1PaymentEnabled() ? Object.fromEntries(
    plans.filter((plan) => {
      const v1 = getPricingV1Plan(plan.code);
      return plan.code !== "FREE" && v1 &&
        plan.status === "ACTIVE" && plan.currencyCode === "EGP" &&
        plan.monthlyPriceAmount === v1.monthlyEgp;
    }).map((plan) => [plan.code, quotePricingV1(plan.code, "ANNUAL").amount]),
  ) : null;
  const replyAddons = process.env.DRVO_PRICING_V1_ADDON_DRAFTS === "true"
    ? PRICING_V1_ADDONS.filter((addon) => addon.unit === "ai_reply" && "validDays" in addon)
        .map((addon) => ({
          quantity: addon.quantity,
          priceEgp: addon.priceEgp,
          validDays: "validDays" in addon ? addon.validDays : 0,
        }))
    : [];
  return <PricingCards plans={plans} annualPrices={annualPrices}
    freeTrialEnabled={process.env.DRVO_PRICING_V1_FREE_TRIAL === "true"}
    replyAddons={replyAddons} />;
}
