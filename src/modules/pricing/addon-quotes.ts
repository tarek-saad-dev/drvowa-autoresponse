import { getPricingV1Addon, isPricingV1AddonAllowed } from './pricing-v1-catalog';

/** V1 server-generated add-on quotes; no client price accepted. */
export function quotePricingV1Addon(code: string, planCode: string) {
 const addon = getPricingV1Addon(code);
 if (!addon || !isPricingV1AddonAllowed(code,planCode)) throw new Error('ADDON_NOT_AVAILABLE');
 return {addonCode:addon.code, quantity:addon.quantity, priceEgp:addon.priceEgp, unit:addon.unit, billingType:addon.type, catalogVersion:'pricing-v1' as const};
}

/** Purchase is not enabled: needs verified payment, expiry lots and settlement. */
export function isPricingV1AddonCheckoutEnabled(): boolean { return false; }
