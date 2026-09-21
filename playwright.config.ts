import { defineConfig, devices } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadDotEnv(): void {
  const envPath = resolve(process.cwd(), ".env");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadDotEnv();

const PORT = Number(process.env.E2E_PORT ?? "3000");
const BASE = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  retries: 1,
  reporter: [["list"]],
  use: {
    baseURL: BASE,
    trace: "on-first-retry",
    locale: "ar-SA",
    navigationTimeout: 60_000,
    actionTimeout: 30_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  // Prefer production server for e2e stability (no HMR remounts).
  // Set E2E_START_SERVER=1. Build first with `npm run build` when using start.
  webServer: process.env.E2E_START_SERVER
    ? {
        command:
          process.env.E2E_USE_DEV === "1"
            ? `npx next dev -p ${PORT}`
            : `npx next start -p ${PORT}`,
        url: `${BASE}/api/health`,
        reuseExistingServer: false,
        timeout: 180_000,
        env: {
          ...process.env,
          PORT: String(PORT),
          MANUAL_INSTAPAY_ENABLED: "1",
          INSTAPAY_PAYMENT_DISPLAY_NAME:
            process.env.INSTAPAY_PAYMENT_DISPLAY_NAME ?? "DRVOWA Test",
          INSTAPAY_PAYMENT_HANDLE:
            process.env.INSTAPAY_PAYMENT_HANDLE ?? "instapay@drvowa-test",
          NODE_ENV:
            process.env.E2E_USE_DEV === "1" ? "development" : "production",
        },
      }
    : undefined,
});
