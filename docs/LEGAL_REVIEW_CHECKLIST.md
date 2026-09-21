# Legal review checklist

**Gate:** `EXTERNAL_GATE_LEGAL_REVIEW`

Scaffold pages: `/privacy`, `/terms` (placeholders via
`NEXT_PUBLIC_LEGAL_COMPANY_NAME`, `NEXT_PUBLIC_SUPPORT_EMAIL`).

Lawyer / owner must approve before claiming commercial launch compliance.

## Checklist

- [ ] Company legal name, address, and registration number confirmed
- [ ] Privacy policy covers account data, WhatsApp message content, AI processing
- [ ] Terms cover acceptable use, WhatsApp/Meta unofficial API risk, quotas
- [ ] Data retention / deletion request process documented
- [ ] Subprocessors list (hosting, email, AI, payments) reviewed
- [ ] Cookie / session disclosure if required for target jurisdictions
- [ ] Refund / billing dispute language aligned with chosen payment provider
- [ ] Arabic (and optional English) final copy signed off
- [ ] Support contact and escalation path published
- [ ] Remove or replace `EXTERNAL_GATE_LEGAL_REVIEW` banners only after sign-off

## Non-goals for engineering

- Do not invent final legal text or claim compliance
- Do not invent prices in marketing while `EXTERNAL_GATE_PRICING` is open
