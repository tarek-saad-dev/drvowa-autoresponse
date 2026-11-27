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

## Operation modes draft (110)
ALL default; BUSINESS_ONLY allowlist capture and AI; MANUAL capture non-private messages but AI only for owner-approved numbers. Mode/approval timestamps block earlier jobs. Shared approvals are currently managed by number in Settings, not inline in Inbox. Existing history not hidden. Worker policy requires companion update; prior queued mirror data can still replay after approvals. E2E, availability and permission verification required.

## Inbox removal draft (111)
Owner-only single/batch removal creates business-wide phone tombstones, separate from reversible private exclusions. Primary inbox list/count/detail/media queries use privacy visibility view. Removed contacts are also included in runtime blocked list. No physical deletion, no WhatsApp deletion, no retention purge; old content and derivatives remain and other CRM/report/escalation surfaces require audit. Existing tabs may retain cached previews until refreshed. Unresolved phones cannot be removed through this action. Maximum 25 IDs per batch and 1000 removal tombstones per business. Deploy migration before app/worker. E2E and concurrency checks required.
