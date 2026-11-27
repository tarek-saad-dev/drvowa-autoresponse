# WhatsApp privacy rollout — P0 draft
Do not deploy before runtime-side enforcement and E2E testing.

- New connections default to fresh; legacy NULL preserves previous behavior until a pairing choice is made.
- SaaS mirror skips history and unscoped chat/label metadata in fresh mode; live messages remain eligible. No existing chats are deleted.
- Fresh mode currently suppresses all chat/label metadata because historical and live metadata are indistinguishable. This affects label, archive, pin and name mirroring.
- Worker may still receive and spool history. Per-account worker policy, media, old spool disposal, reconnect and direct inbound/observed outbound checks remain required.
- Mixed-use allowlisting, AI gating, private contact aliases, deletion and backup handling are follow-up work.
- Validate database migration/permissions, both pairing UIs, legacy compatibility and fail-closed behavior before rollout.
