# Free trial V1 persistence (migration 093, draft)

This additive migration persists first trial activation and lifetime replies per tenant. No records are created automatically, and it does not modify legacy FREE users.

**Not yet active:** existing entitlement reservation/usage worker must be integrated before the new procedure is invoked. The proposed consumed-event table is shared with draft wallet infrastructure; no second meter may run on the same response.

Before production: isolated SQL migration test, replay/concurrent usage test, tenant enrollment check, and verify safe handling when worker send fails. Multiple-WhatsApp remains deferred.
