/**
 * Operator-run, staging-only smoke for the Cashier HTTP connector and CRM API.
 * No production URLs, WhatsApp send APIs or automatic campaign launch.
 *
 * Modes:
 *   node --import tsx scripts/crm-staging-http-smoke.ts --connector-only
 *   node --import tsx scripts/crm-staging-http-smoke.ts --paired
 *
 * Secrets must be injected from an approved staging secret store; never .env in Git.
 */
import { randomUUID } from "node:crypto";

import { requireApprovedStagingOrigin } from "@/modules/crm/staging-guard";

type JsonObject = Record<string, unknown>;

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required staging setting: ${name}`);
  return value;
}

function asRecord(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonObject
    : {};
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

async function callJson(
  origin: string,
  path: string,
  headers: Record<string, string>,
  method: "GET" | "POST" = "GET",
  body?: unknown,
  timeoutMs = 30_000,
): Promise<JsonObject> {
  const response = await fetch(new URL(path, origin), {
    method,
    headers: {
      Accept: "application/json",
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(method === "POST" ? { Origin: origin } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: "error",
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) {
    // Do not print a raw response: it could contain customer data or auth context.
    throw new Error(`Staging endpoint ${path} returned HTTP ${response.status}`);
  }
  const value: unknown = await response.json();
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Unexpected response from ${path}`);
  }
  return asRecord(value);
}

async function main(): Promise<void> {
  const mode = process.argv[2];
  if (mode !== "--connector-only" && mode !== "--paired") {
    throw new Error("Choose --connector-only or --paired");
  }

  const allowlist = required("CRM_STAGING_APPROVED_ORIGINS")
    .split(",").map((value) => value.trim()).filter(Boolean);
  const cashier = requireApprovedStagingOrigin(
    required("CRM_STAGING_CASHIER_URL"),
    allowlist,
  );
  const cashierToken = required("CRM_STAGING_CASHIER_BEARER");
  const cashierHeaders = { Authorization: `Bearer ${cashierToken}` };

  // Check actual HTTP routes, rather than only SQL query text.
  const manifest = await callJson(
    cashier, "/api/integrations/drvowa/v1/manifest", cashierHeaders,
  );
  const tools = list(manifest.tools).map((item) => String(asRecord(item).name ?? ""));
  for (const requiredTool of [
    "customer.list_changes",
    "invoice.list_changes",
    "catalog.list_services",
  ]) {
    if (!tools.includes(requiredTool)) {
      throw new Error(`Staging manifest missing ${requiredTool}`);
    }
  }

  const specs = [
    { name: "customer.list_changes", key: "customers", input: { sinceClientId: 0, limit: 2 } },
    { name: "invoice.list_changes", key: "invoices", input: { sinceInvId: 0, includeInactive: true, limit: 2 } },
    { name: "catalog.list_services", key: "services", input: { sinceProId: 0, limit: 2 } },
  ];
  const samples: Record<string, number> = {};
  for (const spec of specs) {
    const result = await callJson(
      cashier,
      `/api/integrations/drvowa/v1/tools/${encodeURIComponent(spec.name)}`,
      cashierHeaders,
      "POST",
      { requestId: randomUUID(), input: spec.input },
    );
    if (result.ok !== true) throw new Error(`Staging tool failed: ${spec.name}`);
    const data = asRecord(result.data);
    const rows = list(data[spec.key]);
    if (rows.length && !data.nextCursor) {
      throw new Error(`Staging tool omitted pagination cursor: ${spec.name}`);
    }
    samples[spec.key] = rows.length; // counts only; no PII
  }

  if (mode === "--connector-only") {
    console.log(JSON.stringify({
      mode: "connector-only",
      httpConnector: "PASS",
      sampleRowCounts: samples,
      pairedE2E: "NOT_RUN",
      campaignDraft: "NOT_RUN",
    }));
    return;
  }

  const crm = requireApprovedStagingOrigin(
    required("CRM_STAGING_APP_URL"),
    allowlist,
  );
  const crmCookie = required("CRM_STAGING_SESSION_COOKIE");
  const crmHeaders = { Cookie: crmCookie };

  const syncStatusResponse = await callJson(crm, "/api/crm/erp/sync", crmHeaders);
  let syncStatus = asRecord(syncStatusResponse.status);
  if (syncStatus.connected !== true) {
    throw new Error("CRM staging is not paired to Cashier staging");
  }
  const available = asRecord(syncStatus.availableTools);
  if (available.customers !== true || available.invoices !== true || available.catalog !== true) {
    throw new Error("CRM staging manifest does not expose all three ERP tools");
  }

  let syncExecuted = false;
  if (process.env.CRM_STAGING_ENABLE_SYNC === "YES_STAGING_ONLY") {
    const synced = await callJson(
      crm, "/api/crm/erp/sync", crmHeaders, "POST", {}, 180_000,
    );
    if (!synced.result) throw new Error("CRM sync returned no results");
    syncExecuted = true;
    syncStatus = asRecord(synced.status);
  }

  const customersResult = await callJson(
    crm, "/api/crm/customers?page=1&pageSize=2", crmHeaders,
  );
  const customers = list(customersResult.items);
  let profileChecked = false;
  if (customers.length > 0) {
    const customerId = asRecord(customers[0]).customerId;
    if (typeof customerId === "string") {
      const result = await callJson(
        crm,
        `/api/crm/customers/${encodeURIComponent(customerId)}`,
        crmHeaders,
      );
      const profile = asRecord(result.profile);
      if (!profile.customer || !profile.erp) {
        throw new Error("Customer 360 staging response is missing CRM/ERP sections");
      }
      profileChecked = true;
    }
  }

  let ai: { matched: number; eligiblePreview: number } | "NOT_RUN" = "NOT_RUN";
  let spendRefinement: { matched: number } | "NOT_RUN" = "NOT_RUN";
  let snapshot: { matched: number; eligible: number } | "NOT_RUN" = "NOT_RUN";
  let campaignDraft: "NOT_RUN" | "CREATED_TEST_DRAFT_ONLY" = "NOT_RUN";
  if (process.env.CRM_STAGING_ENABLE_AI === "YES_STAGING_ONLY") {
    const channelResult = await callJson(crm, "/api/crm/channels", crmHeaders);
    const activeChannels = list(channelResult.activeChannels)
      .map((item) => asRecord(item))
      .filter((channel) => channel.isActive === true && channel.status === "ACTIVE");
    const explicitId = process.env.CRM_STAGING_CHANNEL_ID?.trim();
    const selected = explicitId
      ? activeChannels.find((item) => item.channelConnectionId === explicitId)
      : activeChannels.length === 1 ? activeChannels[0] : undefined;
    if (!selected || typeof selected.channelConnectionId !== "string") {
      throw new Error("Select an explicitly authorized staging WhatsApp channel before AI/eligibility checks");
    }
    const channelConnectionId = selected.channelConnectionId;

    const result = await callJson(
      crm, "/api/crm/campaigns/ai", crmHeaders, "POST",
      {
        message: process.env.CRM_STAGING_AI_REQUEST?.trim()
          || "هات العملاء اللي عملوا بروتين آخر 30 يوم",
        mode: "filter",
        channelConnectionId,
      },
      55_000,
    );
    const turn = asRecord(result.turn);
    if (turn.kind !== "filter" || !turn.filter) {
      throw new Error("CRM AI did not return a validated audience filter");
    }
    const preview = asRecord(turn.preview);
    const total = Number(preview.totalMatched);
    const eligible = Number(preview.eligibleMarketing);
    if (!Number.isInteger(total) || total < 0 || !Number.isInteger(eligible) || eligible < 0) {
      throw new Error("CRM AI returned invalid audience counts");
    }
    const expectedCount = process.env.CRM_STAGING_EXPECT_PROTEIN_MATCHES;
    if (expectedCount !== undefined && total !== Number(expectedCount)) {
      throw new Error("Protein audience differs from the independently verified staging count");
    }
    ai = { matched: total, eligiblePreview: eligible };

    const refined = await callJson(
      crm, "/api/crm/campaigns/ai", crmHeaders, "POST",
      {
        message: "هات منهم اللي صرفوا أكثر من 1000 جنيه",
        mode: "refine",
        priorFilter: turn.filter,
        channelConnectionId,
      },
      55_000,
    );
    const refineTurn = asRecord(refined.turn);
    const refinedPreview = asRecord(refineTurn.preview);
    const refinedCount = Number(refinedPreview.totalMatched);
    if (refineTurn.kind !== "filter" || !refineTurn.filter
      || !Number.isInteger(refinedCount) || refinedCount < 0 || refinedCount > total) {
      throw new Error("CRM spend refinement did not preserve the audience intersection");
    }
    spendRefinement = { matched: refinedCount };

    if (process.env.CRM_STAGING_ENABLE_SNAPSHOT === "YES_STAGING_ONLY") {
      const frozen = await callJson(
        crm, "/api/crm/audience/freeze", crmHeaders, "POST",
        {
          filter: turn.filter,
          name: "Staging verification - no send",
          channelConnectionId,
        },
        60_000,
      );
      const snapshotId = frozen.snapshotId;
      if (typeof snapshotId !== "string") throw new Error("Audience freeze returned no snapshot");
      const validated = await callJson(
        crm, "/api/crm/audience/revalidate", crmHeaders, "POST",
        { snapshotId, channelConnectionId },
        60_000,
      );
      if (!Array.isArray(validated.eligiblePhones)) {
        throw new Error("Snapshot eligibility revalidation failed");
      }
      snapshot = {
        matched: Number(asRecord(frozen.preview).totalMatched),
        eligible: validated.eligiblePhones.length,
      };

      // Optional one-recipient draft-only test, explicitly gated by an operator.
      // Never use the entire audience list; never invoke preflight launch/delivery.
      if (process.env.CRM_STAGING_ENABLE_DRAFT === "YES_STAGING_ONLY") {
        if (process.env.CRM_STAGING_CONFIRM_DRAFT !== "I_APPROVE_ONE_TEST_RECIPIENT") {
          throw new Error("One-recipient staging draft requires explicit operator confirmation");
        }
        const testPhone = required("CRM_STAGING_CONSENTED_TEST_PHONE");
        if (testPhone.length < 8 || testPhone.length > 15 || [...testPhone].some((digit) => digit < "0" || digit > "9")) {
          throw new Error("Test recipient must be a normalized numeric WhatsApp phone");
        }
        if (!validated.eligiblePhones.includes(testPhone)) {
          throw new Error("Designated staging test recipient is not opted-in on the selected channel");
        }
        const checkedAgain = await callJson(
          crm, "/api/crm/audience/revalidate", crmHeaders, "POST",
          { snapshotId, channelConnectionId }, 60_000,
        );
        if (checkedAgain.channelConnectionId !== channelConnectionId
          || !Array.isArray(checkedAgain.eligiblePhones)
          || !checkedAgain.eligiblePhones.includes(testPhone)) {
          throw new Error("Designated test recipient lost consent before draft creation");
        }
        const listCreated = await callJson(
          crm, "/api/whatsapp/lists", crmHeaders, "POST",
          { name: `CRM STAGING ONE-RECIPIENT ${randomUUID().slice(0, 8)}`, channelConnectionId },
        );
        const listInfo = asRecord(listCreated.list);
        if (typeof listInfo.id !== "string" || listInfo.channelConnectionId !== channelConnectionId) {
          throw new Error("Test WhatsApp list not bound to the selected channel");
        }
        await callJson(
          crm, `/api/whatsapp/lists/${encodeURIComponent(listInfo.id)}/members`,
          crmHeaders, "POST", { text: testPhone },
        );
        const campaign = await callJson(
          crm, "/api/whatsapp/label-campaigns", crmHeaders, "POST",
          {
            channelConnectionId,
            labelId: listInfo.id,
            messageText: "Staging CRM verification: test draft only, not for sending.",
          },
        );
        if (campaign.sendingEnabled !== false || list(campaign.drafts).length === 0) {
          throw new Error("Expected draft-only campaign; sending status was unexpected");
        }
        campaignDraft = "CREATED_TEST_DRAFT_ONLY";
      }
    }
  }

  console.log(JSON.stringify({
    mode: "paired",
    httpConnector: "PASS",
    sampleRowCounts: samples,
    stagingPairing: "PASS",
    sync: syncExecuted ? "EXECUTED" : "NOT_RUN",
    syncResources: list(syncStatus.resources).map((x) => ({
      resource: asRecord(x).resource,
      status: asRecord(x).status,
    })),
    customer360: profileChecked ? "HTTP_SHAPE_PASS" : "NO_CUSTOMER_TO_CHECK",
    aiAudience: ai,
    snapshot,
    spendRefinement,
    campaignDraft,
    bulkSend: "NEVER_CALLED",
  }));
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Staging check failed";
  // Never print environment variables, bearer tokens, or customer payloads.
  console.error(`CRM staging smoke failed: ${message}`);
  process.exitCode = 1;
});
