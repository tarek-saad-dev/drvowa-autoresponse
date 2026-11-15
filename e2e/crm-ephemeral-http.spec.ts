import { createServer, type Server } from "node:http";
import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";

import { closePool, getPool, query, sql } from "../src/lib/db";
import { configureDrvoErpIntegration } from "../src/modules/integrations/service";

type Obj = Record<string, unknown>;
const TEST_DB = "crm_ephemeral_ci";
const SAMPLE = [
  { clientId: 101, name: "Synthetic Alpha", mobile: "01055551111", phone: "01055551111", email: "alpha@example.test" },
  { clientId: 102, name: "Synthetic Bravo", mobile: "01055552222", phone: "01055552222", email: "bravo@example.test" },
  { clientId: 103, name: "Synthetic Cancelled", mobile: "01055553333", phone: "01055553333", email: "cancelled@example.test" },
];
const TODAY = new Date().toISOString().slice(0, 10);
const invoices = [
  { invId: 201, invType: "مبيعات", clientId: 101, clientName: "Synthetic Alpha", mobile: SAMPLE[0].mobile,
    invDate: TODAY, status: "active", isActive: "no", grandTotal: 1500,
    lines: [{ proId: 15, proType: "serv", proName: "بروتين", qty: 1, sPrice: 1500, lineTotal: 1500 }] },
  { invId: 202, invType: "مبيعات", clientId: 102, clientName: "Synthetic Bravo", mobile: SAMPLE[1].mobile,
    invDate: TODAY, status: "active", isActive: "no", grandTotal: 800,
    lines: [{ proId: 15, proType: "serv", proName: "بروتين", qty: 1, sPrice: 800, lineTotal: 800 }] },
  { invId: 203, invType: "مبيعات", clientId: 103, clientName: "Synthetic Cancelled", mobile: SAMPLE[2].mobile,
    invDate: TODAY, status: "cancelled", isActive: "yes", grandTotal: 2000,
    lines: [{ proId: 15, proType: "serv", proName: "بروتين", qty: 1, sPrice: 2000, lineTotal: 2000 }] },
];
const catalog = [{ proId: 15, proName: "بروتين", proNameAr: "بروتين", proType: "serv", isDeleted: false }];

const tools = ["customer.list_changes", "invoice.list_changes", "catalog.list_services"];
const manifest = {
  contractVersion: "drvowa-erp-v1",
  provider: "Synthetic Cashier Contract Emulator",
  providerVersion: "ci-ephemeral",
  capabilities: ["crm-read-only"],
  tools: tools.map((name) => ({
    name, description: "Synthetic read-only page", mode: "READ", approval: "AUTO",
  })),
};

function nextPage<T>(values: T[], cursor: number, key: keyof T, limit: number) {
  const rows = values.filter((x) => Number(x[key]) > cursor).slice(0, limit);
  const last = rows.at(-1);
  return { rows, nextId: last ? Number(last[key]) : cursor };
}

function startEmulator(token: string): Promise<{ server: Server; url: string; calls: string[] }> {
  const calls: string[] = [];
  const server = createServer(async (req, res) => {
    const pathname = new URL(req.url ?? "/", "http://localhost").pathname;
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "no-store");
    if (req.headers.authorization !== `Bearer ${token}`) {
      res.writeHead(401); res.end(JSON.stringify({ error: "unauthorized" })); return;
    }
    if (req.method === "GET" && pathname === "/api/integrations/drvowa/v1/manifest") {
      calls.push("manifest");
      res.writeHead(200); res.end(JSON.stringify(manifest)); return;
    }
    const match = /^\/api\/integrations\/drvowa\/v1\/tools\/([^/]+)$/.exec(pathname);
    const name = match ? decodeURIComponent(match[1]!) : "";
    if (req.method !== "POST" || !tools.includes(name)) {
      res.writeHead(404); res.end(JSON.stringify({ error: "unknown tool" })); return;
    }
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    let body: { input?: Obj } = {};
    try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as typeof body; }
    catch { res.writeHead(400); res.end(JSON.stringify({ error: "bad input" })); return; }
    const input = body.input ?? {};
    const limit = Math.max(1, Math.min(200, Number(input.limit ?? 100)));
    const sweep = input.identitySweep === true || input.statusSweep === true;
    calls.push(`${name}:${sweep ? "sweep" : "append"}`);
    if (name === "customer.list_changes") {
      const key = sweep ? "identitySweepSinceClientId" : "sinceClientId";
      const page = nextPage(SAMPLE, Number(input[key] ?? 0), "clientId", limit);
      res.writeHead(200); res.end(JSON.stringify({
        ok: true, tool: name, data: {
          customers: page.rows, nextCursor: { [key]: page.nextId },
        },
      })); return;
    }
    if (name === "invoice.list_changes") {
      const key = sweep ? "statusSweepSinceInvId" : "sinceInvId";
      const page = nextPage(invoices, Number(input[key] ?? 0), "invId", limit);
      res.writeHead(200); res.end(JSON.stringify({
        ok: true, tool: name, data: {
          invoices: page.rows, nextCursor: { [key]: page.nextId },
        },
      })); return;
    }
    const key = sweep ? "identitySweepSinceProId" : "sinceProId";
    const page = nextPage(catalog, Number(input[key] ?? 0), "proId", limit);
    res.writeHead(200); res.end(JSON.stringify({
      ok: true, tool: name, data: {
        services: page.rows, nextCursor: { [key]: page.nextId },
      },
    }));
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") return reject(new Error("No emulator port"));
      resolve({ server, url: `http://127.0.0.1:${address.port}`, calls });
    });
  });
}

async function postJson(request: import("@playwright/test").APIRequestContext, path: string, data: unknown) {
  const response = await request.post(path, { data, headers: { Origin: "http://localhost:3000" } });
  const json = await response.json().catch(() => ({})) as Obj;
  expect(response.ok(), `${path}: HTTP ${response.status()} ${String(json.error ?? "")}`).toBe(true);
  return json;
}

test("isolated app HTTP → synthetic ERP connector → CRM customer 360 + consent-scoped audience", async ({ request }) => {
  // Hard-stop before any writes. This test may only run against a local ephemeral CI SQL.
  expect(process.env.DRVO_TEST_ISOLATED_DB).toBe("1");
  expect(process.env.DB_NAME).toBe(TEST_DB);
  expect(process.env.DB_SERVER).toMatch(/^(localhost|127\.0\.0\.1)$/);
  expect(process.env.CI).toBe("true");
  expect(process.env.INTEGRATION_SECRET_KEY).toBeTruthy();

  const pool = await getPool();
  const identity = await pool.request().query<{ db: string }>("SELECT DB_NAME() AS db");
  expect(identity.recordset[0]?.db).toBe(TEST_DB);

  const token = `ci-ephemeral-${randomUUID()}`;
  const { server, url, calls } = await startEmulator(token);
  try {
    const email = `crm-ephemeral-${randomUUID()}@example.test`;
    await postJson(request, "/api/auth/signup", {
      email, password: "EphemeralCRM!12345", fullName: "Ephemeral CRM Tester",
    });
    const onboarding = await postJson(request, "/api/onboarding/complete", {
      business: {
        name: "Synthetic CRM Gate", category: "صالون",
        countryCode: "EG", locale: "ar-EG", timezone: "Africa/Cairo",
      },
      location: null,
      agent: {
        name: "Test Agent", roleTitle: "Reception", language: "ar",
        tone: "مهني", instructions: null,
      },
      knowledgeItems: [{ category: "ABOUT", title: "Testing", content: "Synthetic staging data only" }],
    });
    const businessId = (onboarding.business as { businessId?: string } | undefined)?.businessId;
    expect(businessId).toMatch(/^[0-9a-f-]{36}$/i);

    const paired = await configureDrvoErpIntegration({
      businessId: businessId!,
      baseUrl: url,
      outboundToken: token,
      externalReference: "synthetic-ci-cashier",
    });
    expect(paired.integration.status).toBe("ACTIVE");
    expect(paired.manifest?.tools.map((x) => x.name).sort()).toEqual([...tools].sort());

    // Live connector probe is READ-ONLY: only counts from max-one-row tool
    // results, never raw customer or invoice records or production calls.
    const probed = await postJson(request, "/api/crm/erp/probe", {});
    const probe = probed.probe as {
      connected: boolean;
      allToolsReachable: boolean;
      anySourceRows: boolean;
      resources: Array<{ resource: string; ok: boolean; returnedRows: number | null }>;
    };
    expect(probe.connected).toBe(true);
    expect(probe.allToolsReachable).toBe(true);
    expect(probe.anySourceRows).toBe(true);
    expect(probe.resources.map((x) => [x.resource, x.returnedRows])).toEqual([
      ["customers", 1],
      ["invoices", 1],
      ["catalog", 1],
    ]);
    expect(JSON.stringify(probe)).not.toContain("Synthetic Alpha");
    expect(JSON.stringify(probe)).not.toContain("01055551111");

    // Reproduce the production failure: live Cashier probe succeeds but the
    // stored capabilities list contains no sync tools (e.g. old pairing cache).
    // This SQL mutation is restricted to the CI-only ephemeral database above.
    await query(
      `UPDATE dbo.TblIntegration SET CapabilitiesJson = @stale
       WHERE BusinessID = @businessId AND IntegrationID = @integrationId`,
      [
        { name: "stale", type: sql.NVarChar(sql.MAX), value: JSON.stringify({ ...manifest, tools: [] }) },
        { name: "businessId", type: sql.UniqueIdentifier, value: businessId! },
        { name: "integrationId", type: sql.UniqueIdentifier, value: paired.integration.integrationId },
      ],
    );
    const staleResponse = await request.get("/api/crm/erp/sync");
    expect(staleResponse.ok()).toBe(true);
    const staleData = await staleResponse.json() as {
      status: { availableTools: { customers: boolean; invoices: boolean; catalog: boolean } };
    };
    expect(staleData.status.availableTools).toEqual({
      customers: false, invoices: false, catalog: false,
    });

    const channelA = randomUUID();
    const channelB = randomUUID();
    await query(
      `INSERT INTO dbo.TblChannelConnection
        (ChannelConnectionID, BusinessID, Channel, Provider, Status, IsActive, DisplayName)
       VALUES (@a,@b,N'WHATSAPP',N'BAILEYS',N'ACTIVE',1,N'Synthetic Channel A'),
              (@c,@b,N'WHATSAPP',N'BAILEYS',N'ACTIVE',1,N'Synthetic Channel B')`,
      [
        { name: "a", type: sql.UniqueIdentifier, value: channelA },
        { name: "c", type: sql.UniqueIdentifier, value: channelB },
        { name: "b", type: sql.UniqueIdentifier, value: businessId! },
      ],
    );

    const sync = await postJson(request, "/api/crm/erp/sync", {});
    const synced = sync.result as { customers: {synced:number}; invoices:{synced:number}; catalog:{synced:number} };
    expect(synced.customers.synced).toBeGreaterThanOrEqual(3);
    expect(synced.invoices.synced).toBeGreaterThanOrEqual(3);
    expect(synced.catalog.synced).toBeGreaterThanOrEqual(1);
    expect((sync.status as { availableTools: Record<string, boolean> }).availableTools).toEqual({
      customers: true, invoices: true, catalog: true,
    });
    const status = sync.status as {
      resources: Array<{resource:string;status:string}>;
      mirrorCounts: {erpCustomers:number;validInvoices:number;invoiceLines:number;catalogServices:number;unlinkedInvoices:number};
    };
    expect(status.mirrorCounts.erpCustomers).toBe(3);
    expect(status.mirrorCounts.validInvoices).toBe(2);
    expect(status.mirrorCounts.invoiceLines).toBe(3);
    expect(status.mirrorCounts.catalogServices).toBe(1);
    expect(status.mirrorCounts.unlinkedInvoices).toBe(0);
    expect(status.resources).toEqual(expect.arrayContaining([
      expect.objectContaining({ resource: "customers", status: "SUCCESS" }),
      expect.objectContaining({ resource: "invoices", status: "SUCCESS" }),
      expect.objectContaining({ resource: "catalog", status: "SUCCESS" }),
    ]));

    const customersResponse = await request.get("/api/crm/customers?page=1&pageSize=20");
    expect(customersResponse.ok()).toBe(true);
    const customers = await customersResponse.json() as { items: Array<{customerId:string;externalErpClientId:string}> };
    expect(customers.items.length).toBe(3);
    const alpha = customers.items.find((item) => item.externalErpClientId === "101");
    expect(alpha).toBeTruthy();
    const profileResponse = await request.get(`/api/crm/customers/${alpha!.customerId}`);
    expect(profileResponse.ok()).toBe(true);
    const profileData = await profileResponse.json() as { profile: {erp:{totalVisits:number;totalSpend:number};erpInvoices:unknown[]} };
    expect(profileData.profile.erp.totalVisits).toBe(1);
    expect(profileData.profile.erp.totalSpend).toBe(1500);
    expect(profileData.profile.erpInvoices).toHaveLength(1);

    const phoneAlpha = (await query<{PrimaryPhoneNormalized:string}>(
      "SELECT PrimaryPhoneNormalized FROM dbo.TblCrmCustomer WHERE BusinessID=@b AND ExternalErpClientId=N'101'",
      [{name:"b",type:sql.UniqueIdentifier,value:businessId!}],
    )).recordset[0]!.PrimaryPhoneNormalized;
    const phoneBravo = (await query<{PrimaryPhoneNormalized:string}>(
      "SELECT PrimaryPhoneNormalized FROM dbo.TblCrmCustomer WHERE BusinessID=@b AND ExternalErpClientId=N'102'",
      [{name:"b",type:sql.UniqueIdentifier,value:businessId!}],
    )).recordset[0]!.PrimaryPhoneNormalized;
    await query(
      `INSERT INTO dbo.TblWhatsAppCampaignPermission
        (BusinessID,ChannelConnectionID,PhoneNormalized,Source,ProviderMessageID,EvidenceText)
       VALUES
        (@business,@a,@phoneA,N'EXPLICIT_INBOUND',N'synthetic-a',N'Synthetic confirmed consent'),
        (@business,@b,@phoneB,N'EXPLICIT_INBOUND',N'synthetic-b',N'Synthetic confirmed consent')`,
      [
        {name:"business",type:sql.UniqueIdentifier,value:businessId!},
        {name:"a",type:sql.UniqueIdentifier,value:channelA},
        {name:"b",type:sql.UniqueIdentifier,value:channelB},
        {name:"phoneA",type:sql.NVarChar(32),value:phoneAlpha},
        {name:"phoneB",type:sql.NVarChar(32),value:phoneBravo},
      ],
    );
    await query(
      `INSERT INTO dbo.TblWhatsAppCampaignOptOut
        (BusinessID,ChannelConnectionID,PhoneNormalized,ProviderMessageID)
       VALUES (@business,@b,@phoneA,N'synthetic-stop')`,
      [
        {name:"business",type:sql.UniqueIdentifier,value:businessId!},
        {name:"b",type:sql.UniqueIdentifier,value:channelB},
        {name:"phoneA",type:sql.NVarChar(32),value:phoneAlpha},
      ],
    );

    // A message/visit later in the day must be included in an inclusive
    // calendar date lookup. This updates only the throwaway CI SQL database.
    await query(
      `UPDATE dbo.TblCrmCustomer
       SET LastInteractionAtUtc=DATEADD(hour, 18, CAST(@today AS DATETIME2))
       WHERE BusinessID=@business AND ExternalErpClientId=N'101'`,
      [
        { name: "business", type: sql.UniqueIdentifier, value: businessId! },
        { name: "today", type: sql.Date, value: TODAY },
      ],
    );

    const protein = { version:1, all:[{type:"erp_service",op:"pro_id_in",values:["15"],windowDays:30}] };
    const raw = await postJson(request, "/api/crm/audience/preview", {filter:protein,channelConnectionId:channelA});
    expect((raw.preview as {totalMatched:number}).totalMatched).toBe(2);

    // Both active invoice holders match a date query, even before marketing consent.
    // A cancelled invoice is excluded and only final confirmation can send.
    const invoiceDate = {version:1, all:[{type:"erp_invoice_date",op:"between",from:TODAY,to:TODAY}]};
    const invoiceAudience = await postJson(request, "/api/crm/audience/preview", {
      filter: invoiceDate, channelConnectionId: channelA,
    });
    expect((invoiceAudience.preview as {totalMatched:number}).totalMatched).toBe(2);
    const previousDay = new Date(new Date(TODAY + "T12:00:00.000Z").valueOf() - 86400000).toISOString().slice(0, 10);
    const noInvoicesYesterday = await postJson(request, "/api/crm/audience/preview", {
      filter: {version:1,all:[{type:"erp_invoice_date",op:"between",from:previousDay,to:previousDay}]},
      channelConnectionId:channelA,
    });
    expect((noInvoicesYesterday.preview as {totalMatched:number}).totalMatched).toBe(0);

    // Campaign-builder query matrix: execute REAL parameterized SQL through
    // authenticated Next audience-preview HTTP, not just inspect compiled text.
    // No external Gemini call, CRM production query, WhatsApp send or customer PII.
    const queryCases: Array<{
      name: string; filter: Record<string, unknown>; matches: number;
    }> = [
      { name: "Arabic service name بروتين", matches: 2,
        filter: { version:1, all:[{type:"erp_service",op:"name_contains",values:["بروتين"]}] } },
      { name: "same service by catalog ProID", matches: 2,
        filter: { version:1, all:[{type:"erp_service",op:"pro_id_in",values:["15"]}] } },
      { name: "service within full selected date", matches: 2,
        filter: { version:1, all:[{type:"erp_service",op:"name_contains",values:["بروتين"],from:TODAY,to:TODAY}] } },
      { name: "spend over 1000 EGP, no marketing consent required for search", matches: 1,
        filter: { version:1, all:[{type:"erp_spend",op:"gte",amount:1000}] } },
      { name: "spend below 900 including never-purchased customers", matches: 2,
        filter: { version:1, all:[{type:"erp_spend",op:"lte",amount:900}] } },
      { name: "no valid spending excludes cancelled invoice", matches: 1,
        filter: { version:1, all:[{type:"erp_spend",op:"lte",amount:0}] } },
      { name: "visited at least once", matches: 2,
        filter: { version:1, all:[{type:"erp_visits",op:"gte",count:1}] } },
      { name: "never purchased or visited", matches: 1,
        filter: { version:1, all:[{type:"erp_visits",op:"eq",count:0}] } },
      { name: "two visits required", matches: 0,
        filter: { version:1, all:[{type:"erp_visits",op:"gte",count:2}] } },
      { name: "protein customers who spent at least 1000", matches: 1,
        filter: { version:1, all:[
          {type:"erp_service",op:"name_contains",values:["بروتين"]},
          {type:"erp_spend",op:"gte",amount:1000},
        ] } },
      { name: "not a protein service buyer", matches: 1,
        filter: { version:1, all:[{type:"has_phone",value:true}],
          exclude:[{type:"erp_service",op:"name_contains",values:["بروتين"]}] } },
      { name: "high spend OR zero visits", matches: 2,
        filter: { version:1, any:[
          {type:"erp_spend",op:"gte",amount:1000},
          {type:"erp_visits",op:"eq",count:0},
        ] } },
      { name: "valid invoices on specified calendar date", matches: 2,
        filter: { version:1, all:[{type:"erp_invoice_date",op:"between",from:TODAY,to:TODAY}] } },
      { name: "last visit within an exact calendar date", matches: 2,
        filter: { version:1, all:[{type:"erp_last_visit",op:"between",from:TODAY,to:TODAY}] } },
      { name: "last CRM interaction at 18:00 on the final date", matches: 1,
        filter: { version:1, all:[{type:"last_interaction",op:"between",from:TODAY,to:TODAY}] } },
      { name: "never visited even though a cancelled invoice exists", matches: 1,
        filter: { version:1, all:[{type:"erp_last_visit",op:"before_days_ago",days:60}] } },
      { name: "products are not the same as salon services", matches: 0,
        filter: { version:1, all:[{type:"erp_product",op:"name_contains",values:["بروتين"]}] } },
      { name: "a percent character is literal, not LIKE wildcard", matches: 0,
        filter: { version:1, all:[{type:"erp_service",op:"name_contains",values:["%"]}] } },
      { name: "an underscore is literal, not LIKE wildcard", matches: 0,
        filter: { version:1, all:[{type:"erp_service",op:"name_contains",values:["_"]}] } },
    ];
    for (const scenario of queryCases) {
      const response = await postJson(request, "/api/crm/audience/preview", {
        filter: scenario.filter,
        channelConnectionId: channelA,
      });
      const result = response.preview as {totalMatched: number; customers: Array<{customerId:string}>};
      expect(result.totalMatched, scenario.name).toBe(scenario.matches);
      expect(result.customers.length, scenario.name + " preview").toBe(scenario.matches);
      // Multiple invoices cannot duplicate the audience's distinct customers.
      const ids = result.customers.map((c) => c.customerId);
      expect(new Set(ids).size, scenario.name + " distinct").toBe(ids.length);
    }
    console.log(`CRM_AUDIENCE_SQL_QUERY_MATRIX_PASS ${queryCases.length} audited isolated scenarios`);

    const refined = { version:1, all:[
      {type:"erp_service",op:"pro_id_in",values:["15"],windowDays:30},
      {type:"erp_spend",op:"gte",amount:1000},
      {type:"marketing_permission",op:"eligible"},
    ] };
    const onA = await postJson(request, "/api/crm/audience/preview", {filter:refined,channelConnectionId:channelA});
    expect((onA.preview as {totalMatched:number}).totalMatched).toBe(1);
    const onB = await postJson(request, "/api/crm/audience/preview", {filter:refined,channelConnectionId:channelB});
    expect((onB.preview as {totalMatched:number}).totalMatched).toBe(0);

    const frozen = await postJson(request, "/api/crm/audience/freeze", {
      filter: protein, name:"Synthetic freeze without send", channelConnectionId:channelA,
    });
    expect(frozen.snapshotId).toBeTruthy();
    const revalidated = await postJson(request, "/api/crm/audience/revalidate", {
      snapshotId: frozen.snapshotId, channelConnectionId:channelA,
    });
    expect((revalidated.eligiblePhones as string[]).length).toBe(1);
    expect((revalidated.eligiblePhones as string[])[0]).toBe(phoneAlpha);

    // Test an actual persisted DRAFT through the same API sequence as Campaign Builder,
    // using ONLY the one synthetic phone revalidated on the selected channel.
    // This path never calls WhatsApp runtime/launch/send.
    const testList = await postJson(request, "/api/whatsapp/lists", {
      name: `Synthetic CRM list ${randomUUID().slice(0, 8)}`,
      channelConnectionId: channelA,
    });
    const listInfo = testList.list as { id: string; channelConnectionId: string };
    expect(listInfo.channelConnectionId).toBe(channelA);
    const added = await postJson(
      request, `/api/whatsapp/lists/${encodeURIComponent(listInfo.id)}/members`,
      { text: phoneAlpha },
    );
    expect(added.sendsMessages).toBe(false);
    expect(added.total).toBe(1);

    const draft = await postJson(request, "/api/whatsapp/label-campaigns", {
      channelConnectionId: channelA,
      labelId: listInfo.id,
      messageText: "Synthetic CI test draft, do not send.",
    });
    expect(draft.sendingEnabled).toBe(false);
    expect((draft.drafts as Array<{draftId: string; status: string}>).length).toBe(1);
    expect((draft.drafts as Array<{draftId: string; status: string}>)[0]?.status).toBe("DRAFT");
    const stored = await query<{ Status: string; PhoneCount: number }>(
      `SELECT d.Status,
         (SELECT COUNT(1) FROM dbo.TblWhatsAppContactLabel cl
          WHERE cl.BusinessID=d.BusinessID
            AND cl.ChannelConnectionID=d.ChannelConnectionID
            AND cl.ProviderLabelID=d.ProviderLabelID AND cl.IsActive=1) AS PhoneCount
       FROM dbo.TblWhatsAppLabelCampaignDraft d
       WHERE d.BusinessID=@business AND d.CampaignDraftID=@draft`,
      [
        { name: "business", type: sql.UniqueIdentifier, value: businessId! },
        { name: "draft", type: sql.UniqueIdentifier, value: (draft.drafts as Array<{draftId:string}>)[0]!.draftId },
      ],
    );
    expect(stored.recordset[0]?.Status).toBe("DRAFT");
    expect(Number(stored.recordset[0]?.PhoneCount)).toBe(1);

    // Simulate a resumable incremental import AFTER a previous successful sync.
    // Cashier can contain legacy phones that normalize inconsistently or are
    // reused between different ERP clients. Neither case may stop an entire
    // batch or silently associate invoices with another ERP customer.
    SAMPLE.push(
      {
        clientId: 104, name: "Synthetic Invalid Phone",
        mobile: "00001234567", phone: "not-a-phone", email: "invalid@example.test",
      },
      {
        clientId: 105, name: "Synthetic Duplicate Phone Different ERP ID",
        mobile: SAMPLE[0]!.mobile, phone: SAMPLE[0]!.phone, email: "reuse@example.test",
      },
      {
        clientId: 106, name: "Synthetic Following Valid Customer",
        mobile: "01055554444", phone: "01055554444", email: "following@example.test",
      },
    );
    invoices.push({
      invId: 204, invType: "مبيعات", clientId: 104,
      clientName: "Synthetic Invalid Phone", mobile: "00001234567",
      invDate: TODAY, status: "active", isActive: "no", grandTotal: 700,
      lines: [{
        proId: 15, proType: "serv", proName: "بروتين",
        qty: 1, sPrice: 700, lineTotal: 700,
      }],
    });

    const continued = await postJson(request, "/api/crm/erp/sync", {});
    const continuedResult = continued.result as {
      customers: {synced:number}; invoices:{synced:number}; catalog:{synced:number};
    };
    expect(continuedResult.customers.synced).toBeGreaterThanOrEqual(3);
    expect(continuedResult.invoices.synced).toBeGreaterThanOrEqual(1);
    const continuedStatus = continued.status as {
      mirrorCounts: {
        erpCustomers:number; erpCustomersWithoutPhone:number;
        validInvoices:number; unlinkedInvoices:number; invoiceLines:number;
      };
      resources: Array<{resource:string;status:string}>;
    };
    expect(continuedStatus.mirrorCounts.erpCustomers).toBe(6);
    expect(continuedStatus.mirrorCounts.erpCustomersWithoutPhone).toBe(2);
    expect(continuedStatus.mirrorCounts.validInvoices).toBe(3);
    expect(continuedStatus.mirrorCounts.unlinkedInvoices).toBe(0);
    expect(continuedStatus.resources).toEqual(expect.arrayContaining([
      expect.objectContaining({ resource: "customers", status: "SUCCESS" }),
      expect.objectContaining({ resource: "invoices", status: "SUCCESS" }),
      expect.objectContaining({ resource: "catalog", status: "SUCCESS" }),
    ]));
    const imported = await query<{ExternalErpClientId:string;PrimaryPhoneNormalized:string|null}>(
      `SELECT ExternalErpClientId, PrimaryPhoneNormalized
       FROM dbo.TblCrmCustomer
       WHERE BusinessID = @businessId AND ExternalErpClientId IN (N'101', N'104', N'105', N'106')
         AND Status <> N'MERGED'`,
      [{ name:"businessId", type:sql.UniqueIdentifier, value:businessId! }],
    );
    const byErp = new Map(imported.recordset.map(row => [row.ExternalErpClientId, row.PrimaryPhoneNormalized]));
    expect(byErp.get("104")).toBeNull();
    expect(byErp.get("105")).toBeNull();
    expect(byErp.get("106")).toBe("201055554444");
    expect(byErp.get("101")).toBe(phoneAlpha);
    const invalidInvoice = await query<{ExternalClientId:string|null;CustomerID:string|null}>(
      `SELECT ExternalClientId, CustomerID FROM dbo.TblErpInvoiceMirror
       WHERE BusinessID=@businessId AND ExternalInvId=N'مبيعات:204'`,
      [{ name:"businessId", type:sql.UniqueIdentifier, value:businessId! }],
    );
    expect(invalidInvoice.recordset[0]?.ExternalClientId).toBe("104");
    expect(invalidInvoice.recordset[0]?.CustomerID).toBeTruthy();

    // Regression for production nginx 504: each HTTP request MUST import just
    // one bounded page of one requested resource and persist a resumable
    // PARTIAL cursor. This uses the isolated SQL server above, never production.
    for (let i = 0; i < 26; i += 1) {
      SAMPLE.push({
        clientId: 107 + i,
        name: "Synthetic Chunk " + i,
        mobile: "010" + String(70000000 + i),
        phone: "010" + String(70000000 + i),
        email: "chunk" + i + "@example.test",
      });
    }
    const firstCustomerBatch = await postJson(request, "/api/crm/erp/sync", { resource: "customers" });
    const firstCustomers = firstCustomerBatch.result as {
      customers:{synced:number;skipped:boolean};
      invoices:{synced:number;skipped:boolean};
      catalog:{synced:number;skipped:boolean};
    };
    expect(firstCustomerBatch.resource).toBe("customers");
    expect(firstCustomers.customers.synced).toBe(25);
    expect(firstCustomers.invoices.skipped).toBe(true);
    expect(firstCustomers.catalog.skipped).toBe(true);
    expect((firstCustomerBatch.status as {resources:Array<{resource:string;status:string}>}).resources)
      .toEqual(expect.arrayContaining([expect.objectContaining({resource:"customers",status:"PARTIAL"})]));
    const secondCustomerBatch = await postJson(request, "/api/crm/erp/sync", { resource: "customers" });
    expect((secondCustomerBatch.status as { mirrorCounts:{erpCustomers:number} }).mirrorCounts.erpCustomers).toBe(32);
    expect((secondCustomerBatch.status as { resources:Array<{resource:string;status:string}> }).resources)
      .toEqual(expect.arrayContaining([expect.objectContaining({resource:"customers",status:"SUCCESS"})]));

    for (let i = 0; i < 11; i += 1) {
      invoices.push({
        invId: 205 + i, invType: "مبيعات", clientId: 101,
        clientName: "Synthetic Alpha", mobile: SAMPLE[0]!.mobile,
        invDate: TODAY, status: "active", isActive: "no", grandTotal: 25,
        lines: [{ proId: 15, proType: "serv", proName: "بروتين", qty: 1, sPrice: 25, lineTotal: 25 }],
      });
    }
    const firstInvoiceBatch = await postJson(request, "/api/crm/erp/sync", { resource: "invoices" });
    expect((firstInvoiceBatch.result as {invoices:{synced:number}}).invoices.synced).toBe(10);
    expect((firstInvoiceBatch.status as { resources:Array<{resource:string;status:string}> }).resources)
      .toEqual(expect.arrayContaining([expect.objectContaining({resource:"invoices",status:"PARTIAL"})]));
    const finalInvoiceBatch = await postJson(request, "/api/crm/erp/sync", { resource: "invoices" });
    expect((finalInvoiceBatch.status as { mirrorCounts:{validInvoices:number} }).mirrorCounts.validInvoices).toBe(14);
    expect((finalInvoiceBatch.status as { resources:Array<{resource:string;status:string}> }).resources)
      .toEqual(expect.arrayContaining([expect.objectContaining({resource:"invoices",status:"SUCCESS"})]));

    // A malformed resource must be rejected before any ERP writes.
    const invalidResource = await request.post("/api/crm/erp/sync", {
      data: { resource: "unknown" },
      headers: { Origin: "http://localhost:3000" },
    });
    expect(invalidResource.status()).toBe(400);

    // No customer data is dropped just because a phone is bad; no WhatsApp
    // recipients are inferred for phone-less ERP customers.
    // There is no WhatsApp send or real Cashier connection in this test.
    expect(calls).toContain("manifest");
    expect(calls).toContain("customer.list_changes:append");
    expect(calls).toContain("invoice.list_changes:append");
    expect(calls).toContain("catalog.list_services:append");
    console.log("CRM_EPHEMERAL_HTTP_PASS synthetic-app-runtime+sql+erp-emulator+draft no-send");
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await closePool().catch(() => undefined);
  }
});
