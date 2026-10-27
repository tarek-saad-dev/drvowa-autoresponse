# V1 FREE quota integration (pilot flag)

The active quota reservation code now optionally applies a seven-day and 30-lifetime-reply limit to **explicitly enrolled** FREE tenants only. It reads the existing TblUsageReservation records across all months (RESERVED/CONSUMED/UNCERTAIN) and uses a lock on TblPricingFreeTrial per tenant to serialize concurrent requests. RELEASED reservations do not count. There is no second AI charging path.

Flag: `DRVO_PRICING_V1_FREE_TRIAL=true` (default off). Requires migration 093. Missing trial row preserves old FREE behavior. Trial first activation is immutable.

**Known gaps before launch:** the separate first-activation procedure is not called automatically for new accounts; preview/display is not integrated; existing free precheck remains month-based (authoritative reserve blocks overage); SQL concurrency and deployment tests have not run. The draft lifetime column is not used by this path and should not be presented as a settled-replies counter.
