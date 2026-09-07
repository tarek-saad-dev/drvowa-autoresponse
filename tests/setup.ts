import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { vi } from "vitest";

import { getCookieJar } from "./helpers/cookies";

/**
 * Soft-load .env into process.env without overwriting existing values.
 */
function loadDotEnvIfPresent(): void {
  const envPath = resolve(process.cwd(), ".env");
  if (!existsSync(envPath)) {
    return;
  }

  const text = readFileSync(envPath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const eq = trimmed.indexOf("=");
    if (eq <= 0) {
      continue;
    }

    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadDotEnvIfPresent();

vi.mock("next/headers", () => ({
  cookies: async () => {
    const cookieJar = getCookieJar();
    return {
      get: (name: string) => {
        const value = cookieJar.get(name);
        return value !== undefined ? { name, value } : undefined;
      },
      set: (opts: { name: string; value: string; maxAge?: number }) => {
        if (opts.maxAge === 0 || opts.value === "") {
          cookieJar.delete(opts.name);
          return;
        }
        cookieJar.set(opts.name, opts.value);
      },
    };
  },
}));
