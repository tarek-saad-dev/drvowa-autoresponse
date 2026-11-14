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
    const status = sync.status as { resources: Array<{resource:string;status:string}> };
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

    const protein = { version:1, all:[{type:"erp_service",op:"pro_id_in",values:["15"],windowDays:30}] };
    const raw = await postJson(request, "/api/crm/audience/preview", {filter:protein,channelConnectionId:channelA});
    expect((raw.preview as {totalMatched:number}).totalMatched).toBe(2);
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
