/**
 * No credentials, no POSTs, no DB access, no user mutation, no deploy.
 * Tests deployed public services exactly as they are now, NOT pending PR code.
 */
const routes = [
  { name: "AutoRespond public health", url: "https://app.drvotech.com/api/health", kind: "health" },
  { name: "AutoRespond database readiness", url: "https://app.drvotech.com/api/health?ready=1", kind: "crm-db-ready" },
  { name: "Cashier app+SQL readiness", url: "https://ops.cutsaloon.com/api/health/ready", kind: "health" },
  { name: "AutoRespond CRM auth boundary", url: "https://app.drvotech.com/api/crm/erp/sync", kind: "protected" },
  { name: "Cashier login page", url: "https://ops.cutsaloon.com/login", kind: "page" },
  { name: "Cashier connector auth boundary", url: "https://ops.cutsaloon.com/api/integrations/drvowa/v1/manifest", kind: "protected" },
];

const outcomes = [];
for (const { name, url, kind } of routes) {
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "manual",
      headers: { Accept: "application/json, text/html;q=0.8" },
      signal: AbortSignal.timeout(15_000),
    });
    const status = res.status;
    let result = "FAIL";
    if (kind === "health") result = status === 200 ? "LIVE" : "FAIL";
    if (kind === "crm-db-ready") {
      if (status === 200) {
        const body = await res.json().catch(() => ({}));
        result = body && typeof body === "object" && body.database === "up" ? "DB_UP" : "FAIL_DB_NOT_READY";
      } else result = "FAIL";
    }
    if (kind === "page") result = status === 200 || (status >= 300 && status < 400) ? "LIVE" : "FAIL";
    if (kind === "protected") {
      result = [401, 403].includes(status)
        ? "AUTH_REQUIRED" : status === 404 ? "NOT_DEPLOYED" : "FAIL_UNEXPECTED_PUBLIC_RESPONSE";
    }
    outcomes.push({ name, status, result });
  } catch (error) {
    // Do not serialize response bodies or arbitrary fetch errors.
    outcomes.push({ name, status: null, result: "NETWORK_UNAVAILABLE" });
  }
}
console.log(JSON.stringify({ test: "CRM production read-only canary", source: "public endpoints, unauthenticated", outcomes }, null, 2));
const failed = outcomes.some(x => x.result.startsWith("FAIL") || x.result === "NETWORK_UNAVAILABLE");
const deployedCrm = outcomes.find(x=>x.name==="AutoRespond CRM auth boundary")?.result === "AUTH_REQUIRED";
const deployedCashier = outcomes.find(x=>x.name==="Cashier connector auth boundary")?.result === "AUTH_REQUIRED";
console.log(deployedCrm && deployedCashier
  ? "CRM_PRODUCTION_PUBLIC_BOUNDARIES_PRESENT; not proof of authenticated cross-app E2E"
  : "CRM_PRODUCTION_FEATURE_GATE_NOT_PROVEN; pending branches not necessarily deployed");
if (failed) process.exitCode = 1;
