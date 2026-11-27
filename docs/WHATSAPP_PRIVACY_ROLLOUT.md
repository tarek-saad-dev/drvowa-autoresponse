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

## Privacy Center draft
Owner-only settings/privacy page consolidates mode and private numbers, persistent removals, linked pairing settings, and read-only retention inventory. Inventory counts DB rows by CreatedAtUtc, not physical files/backups; no deletion or scheduled policy is activated. Additional visibility gates added for CRM conversation links/panel, unlinked contacts, escalation queries, Pulse reports/scanner/shadow AI, and campaign dispatch. Further audit needed for CRM derived records, external integrations, logs, exports, notifications and in-flight operations. Do not describe as erasure. Physical purge requires dependency inventory and tested backup/media/queue cleanup.

## Content purge maintenance draft (112)
The owner may save a retention preference (not an active automatic rule). `npm run privacy:maintain -- BUSINESS_UUID removed|retention` previews only. `--apply` is a bounded offline maintenance operation (100 rows + up to 100 queued files), requires explicit offline env and absolute media directory. Stop all SaaS, AI, and runtime writers first; never run online. It clears selected message content, attachments and known Pulse derivatives/triggered generated replies, keeps message metadata/provider IDs as dedup tombstones, and skips conversations with active or unknown-status jobs. Media deletion is resumable via DB queue and checks no current reference exists. No claim of complete erasure: CRM, escalations, logs, backups, other jobs/exports, cross-channel replay and provider history need separate review. No scheduler or production execution authorized. Retention uses CreatedAtUtc; never delete by a user-supplied path.

## Release hardening (113)
SQL AI eligibility applies visibility, non-historical/non-purged status, mode and approval watermarks to Pulse shadow assessment. Added isolated SQL fixture covering tenant isolation, private removal, manual/approved and business-only policy. Worker policy outage remains fail-closed (new events can be missed); V6 and backup/derived retention are not covered. Do not enable purge flags or deploy until coordinated compatibility checks and real mixed-number staging tests pass.

## Workspace reset (114)
Owner-only typed-confirmation reset hides all pre-reset WhatsApp history/contact-only chats and clears imported names, labels and conversation timeline fields. New allowed live events reappear; explicit private/removed policies remain. Old history permanently rejected after reset; CRM master records/ERP/billing/auth untouched. Pre-reset content remains stored pending offline `privacy:maintain BUSINESS_UUID reset` operation; no automatic physical erasure or full derived/backup purge. Existing in-flight sends and other direct reporting/notification surfaces need further review. V7 worker reset spool handling must be coordinated separately.

## Reset cleanup progress and drain
The owner reset preview now returns pending message and queued media counts and distinguishes PENDING from CONTENT_CLEANED (primary content only). An operator can explicitly drain at most 100 batches per run, after stopping ALL writers and verifying the real media directory, with `DRVO_PRIVACY_OFFLINE_MAINTENANCE=true npm run privacy:maintain -- BUSINESS_UUID reset --apply --drain`. Exit 2 means work remains; rerun only in verified offline maintenance. No production invocation, no automatic scheduling, no backup or complete identity erasure.
