import { unstable_cache } from "next/cache";
import { connection } from "next/server";
import { listActivePlans } from "@/modules/billing/repository";
import type { Plan } from "@/types/domain";
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
  return <PricingCards plans={plans} />;
}
