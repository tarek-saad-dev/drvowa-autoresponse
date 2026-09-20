# DRVOWA Launch Checklist

## Engineering (must be YES)

- [ ] Auth: signup/login/logout/session secure
- [ ] Auth: rate limits on login/signup
- [ ] Auth: password reset lifecycle (provider may be gated)
- [ ] Tenant isolation proven by tests
- [ ] Onboarding complete + resumable
- [ ] WhatsApp connect/QR/reconnect UX accurate
- [ ] Inbox operational
- [ ] **Human manual reply**
- [ ] Human takeover safe vs AI race
- [ ] AI worker durable + quota safe
- [ ] Knowledge + Agent limits enforced
- [ ] Billing/usage dashboards accurate
- [ ] Landing/dashboard copy matches reality
- [ ] `/privacy` + `/terms` pages present
- [ ] No launch-facing “next phase” lies
- [ ] Rate limits on sensitive APIs
- [ ] No secrets/PII in ordinary logs
- [ ] Health/readiness + runbooks
- [ ] Migrations 001→latest clean + upgrade path
- [ ] `npm test` / typecheck / lint / build PASS
- [ ] E2E release flows A–J covered or explicitly deferred with reason

## External (may remain OPEN)

- [ ] Payment provider credentials
- [ ] Final pricing
- [ ] Email provider credentials
- [ ] Legal review sign-off
- [ ] Error monitoring vendor
- [ ] DNS/domain
- [ ] Production secrets + deploy (human-operated)

## Stop condition

`PRELAUNCH_READY = YES` when all Engineering items are YES and only External items remain.
