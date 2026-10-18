import { closePool } from "@/lib/db";
import { parseHubTimestamp } from "./saas-financial-contract";
import { readSaasFinancialConfig } from "./saas-financial-config";
import { resolveHubSecret } from "./saas-financial-worker";
import { compareFinancialEvidence } from "./saas-financial-reconciliation-compare";
import { createInventoryClient, type InventoryPage, type InventoryWindow } from "./saas-financial-reconciliation-client";
import { beginScan, finishScan, loadLocalEvidence, loadObservedHub, recordPage, setScanState,
  type ScanRun } from "./saas-financial-reconciliation-repository";

type Environment = Readonly<Record<string, string | undefined>>;
type Dependencies = {
  begin?: typeof beginScan; record?: typeof recordPage; local?: typeof loadLocalEvidence;
  observed?: typeof loadObservedHub; finish?: typeof finishScan; state?: typeof setScanState;
  fetch?: ReturnType<typeof createInventoryClient>; close?: typeof closePool;
  sleep?: (ms: number) => Promise<void>; clock?: () => number;
  logger?: Pick<Console, "info" | "warn">;
};
const safeCodes = new Set(["RECONCILIATION_ALREADY_RUNNING", "INVENTORY_NETWORK_ERROR",
  "RECONCILIATION_BOUNDARY_CHANGED",
  "INVENTORY_AUTH_ERROR", "INVENTORY_RATE_LIMITED", "INVENTORY_HUB_UNAVAILABLE",
  "INVENTORY_INVALID_REQUEST", "INVENTORY_UNEXPECTED_STATUS", "INVALID_INVENTORY_RESPONSE",
  "INVENTORY_RESPONSE_TOO_LARGE", "HUB_FACT_CONFLICT", "LOCAL_EVIDENCE_LIMIT",
  "SCAN_UPPER_CHANGED", "SCAN_START_CHANGED", "SOURCE_ACTIVATION_CHANGED",
  "CURSOR_REPEATED", "HUB_ID_ORDER", "PAGE_LIMIT_EXCEEDED", "SCAN_DURATION_EXCEEDED"]);
function safeCode(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  return safeCodes.has(message) ? message : "SCAN_FAILED";
}
function windowFromEnv(env: Environment): InventoryWindow | null {
  const from = env.DRVO_SAAS_FINANCIAL_RECONCILIATION_ACCEPTED_FROM;
  const before = env.DRVO_SAAS_FINANCIAL_RECONCILIATION_ACCEPTED_BEFORE;
  if (from === undefined && before === undefined) return null;
  if (!from || !before || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/.test(from)
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/.test(before))
    throw new Error("INVALID_RECONCILIATION_WINDOW");
  const a = parseHubTimestamp(from).canonical, b = parseHubTimestamp(before).canonical;
  if (a >= b) throw new Error("INVALID_RECONCILIATION_WINDOW");
  return { accepted_from: a, accepted_before: b };
}
function decimalId(id: string): bigint {
  if (!/^(?:0|[1-9]\d*)$/.test(id)) throw new Error("HUB_ID_ORDER");
  return BigInt(id);
}

/** One bounded invocation. A paused run resumes with its persisted cursor on the next invocation. */
export async function runFinancialReconciliation(env: Environment = process.env, deps: Dependencies = {}):
  Promise<{ status: string; runId?: string; findings?: number }> {
  const config = readSaasFinancialConfig(env);
  const logger = deps.logger ?? console;
  if (!config.reconciliationEnabled) {
    logger.info("[saas-financial-reconcile] disabled");
    return { status: "NOT_RECONCILED" };
  }
  const secret = resolveHubSecret(config, env);
  const requestedWindow = windowFromEnv(env);
  const fetch = deps.fetch ?? createInventoryClient({
    endpoint: config.endpoint!, keyId: config.credentialKeyId!, secret,
  });
  const begin = deps.begin ?? beginScan, record = deps.record ?? recordPage;
  const local = deps.local ?? loadLocalEvidence, observed = deps.observed ?? loadObservedHub;
  const finish = deps.finish ?? finishScan, state = deps.state ?? setScanState;
  const clock = deps.clock ?? Date.now;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms)));
  let run: ScanRun | undefined;
  try {
    run = await begin(config.sourceKey!, config.sourceActivatedAt!, config.captureCutoffAt!, requestedWindow, 20);
    const window = run.AcceptedFromText && run.AcceptedBeforeText
      ? { accepted_from: run.AcceptedFromText + "Z", accepted_before: run.AcceptedBeforeText + "Z" } : null;
    const complete = async () => {
      const evidence = await local(config.sourceKey!, config.captureCutoffAt!);
      const hub = await observed(run!);
      const findings = compareFinancialEvidence({
        ...evidence, hub, cutoff: config.captureCutoffAt!, fullInventory: window === null,
      });
      await finish(run!, findings);
      const status = findings.length ? "DISCREPANCIES_OBSERVED" : "OBSERVED_MATCHES_PROVISIONAL";
      logger.info("[saas-financial-reconcile] complete",
        { runId: run!.RunID, status, pages: run!.PagesRead, events: run!.EventsRead, findings: findings.length });
      return { status, runId: run!.RunID, findings: findings.length };
    };
    if (run.TraversalComplete) return complete();
    let cursor = run.NextCursor;
    let upper = run.ScanUpperHubEventID;
    let scanStarted = run.HubScanStartedAtText ? run.HubScanStartedAtText + "Z" : null;
    let lastId = BigInt(0);
    const seenCursors = new Set<string>();
    const deadline = clock() + 90_000;
    for (let pages = 0; pages < 15; pages++) {
      if (run.PagesRead >= 1000) throw new Error("PAGE_LIMIT_EXCEEDED");
      if (clock() >= deadline) throw new Error("SCAN_DURATION_EXCEEDED");
      if (pages > 0) await sleep(5_000); // At most 12 requests/minute; reserve IP capacity for other clients.
      const page: InventoryPage = await fetch({ limit: 20, ...(window ?? {}), ...(cursor ? { cursor } : {}) });
      if (page.events.length > 20 || parseHubTimestamp(page.source_activated_at).epochMicroseconds
          !== parseHubTimestamp(config.sourceActivatedAt!).epochMicroseconds) {
        throw new Error("SOURCE_ACTIVATION_CHANGED");
      }
      if (upper !== null && page.scan_upper_hub_event_id !== upper) throw new Error("SCAN_UPPER_CHANGED");
      if (scanStarted !== null && page.scan_started_at !== scanStarted) throw new Error("SCAN_START_CHANGED");
      if (page.has_more && (page.next_cursor === cursor || seenCursors.has(page.next_cursor!)))
        throw new Error("CURSOR_REPEATED");
      if (page.next_cursor) seenCursors.add(page.next_cursor);
      for (const event of page.events) {
        const id = decimalId(event.hub_event_id);
        if (id <= lastId || id > decimalId(page.scan_upper_hub_event_id)) throw new Error("HUB_ID_ORDER");
        lastId = id;
        if (window && (event.accepted_at < window.accepted_from || event.accepted_at >= window.accepted_before))
          throw new Error("INVALID_INVENTORY_RESPONSE");
      }
      await record(run, page);
      run.PagesRead++;
      run.EventsRead += page.events.length;
      upper = page.scan_upper_hub_event_id;
      scanStarted = page.scan_started_at;
      cursor = page.next_cursor;
      if (!page.has_more) {
        return complete();
      }
    }
    await state(run, "PAUSED");
    logger.info("[saas-financial-reconcile] paused", { runId: run.RunID, pages: run.PagesRead });
    return { status: "SCAN_INCOMPLETE", runId: run.RunID };
  } catch (error) {
    const code = safeCode(error);
    if (run) {
      try { await state(run, "SCAN_INCOMPLETE", code); } catch { /* preserve original failure */ }
    }
    logger.warn("[saas-financial-reconcile] incomplete", { runId: run?.RunID, code });
    return { status: "SCAN_INCOMPLETE", runId: run?.RunID };
  } finally {
    await (deps.close ?? closePool)();
  }
}
