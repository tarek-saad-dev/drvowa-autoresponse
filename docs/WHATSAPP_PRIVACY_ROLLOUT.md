# WhatsApp privacy rollout — P0 draft
Do not deploy before both PRs pass E2E testing.

- Migration 108: new connections default to fresh; legacy NULL preserves previous behavior until a pairing choice is made.
- SaaS mirror skips history and unscoped chat/label metadata in fresh mode; live messages remain eligible. No existing chats are deleted.
- Runtime policy endpoint uses the existing S2S bearer and account-key lookup. It returns only historyImportEnabled, with no caching by HTTP intermediaries. It works before ACTIVE status so policy is available at QR pairing.
- Fresh mode currently suppresses all chat/label metadata because historical and live metadata are indistinguishable. This affects label, archive, pin and name mirroring.
- Deploy migration and SaaS endpoint before the V7 worker update, then restart workers and validate both pairing surfaces. Old V7 binaries must not be presented as providing worker-side privacy.
- Worker-side consent is bounded by policy refresh timing and protocol-level receipt; do not claim that WhatsApp never sends personal data to a linked device. Check pending legacy spools, media, reconnect, LID identity mapping and historical outbound observation.
- Mixed-use allowlisting, AI gating for new personal messages, private contact aliases, deletion and backup handling are follow-up work.
- Validate database permissions and end-to-end behavior before rollout. Legacy V6 is not covered by the V7 worker change.

## Private contacts draft (109)
Owner-only business-level exclusions. Inbound, mirror/label association, outbound observations, AI job generation/send checks and runtime policy endpoint. Previously stored conversations are NOT hidden or erased; manual sends/campaigns, media upload, worker capture, queued data disposal and in-flight race fencing need further work. Unknown identities are blocked when any exclusions exist. Regression suite must be updated and run; do not deploy.
