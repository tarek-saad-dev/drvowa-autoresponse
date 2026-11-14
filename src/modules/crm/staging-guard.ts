/**
 * Explicit allowlist for operator-run CRM staging smokes.
 * Never read credentials for an arbitrary host from an untrusted PR/config value.
 * This is a safety check in addition to isolated staging credentials, not a
 * substitute for network egress controls.
 */
export function requireApprovedStagingOrigin(
  value: string,
  approvedOrigins: readonly string[],
): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("Invalid staging URL");
  }
  if (!["http:", "https:"].includes(parsed.protocol)
    || parsed.username || parsed.password || parsed.search || parsed.hash
    || (parsed.pathname !== "/" && parsed.pathname !== "")) {
    throw new Error("Staging URL must be an origin without credentials, query or path");
  }
  const rawHostname = parsed.hostname.toLowerCase();
  const hostname = rawHostname.startsWith("[") && rawHostname.endsWith("]")
    ? rawHostname.slice(1, -1)
    : rawHostname;
  const loopback = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  const stages = /(^|[.-])(staging|stage|preview|sandbox|test|dev)([.-]|$)/i;
  if (!loopback && !stages.test(hostname)) {
    throw new Error("Refusing a non-staging hostname");
  }
  if (!loopback && parsed.protocol !== "https:") {
    throw new Error("Remote staging endpoints must use HTTPS");
  }
  const approved = new Set(approvedOrigins.map((origin) => {
    try {
      const approvedUrl = new URL(origin);
      if (!["http:", "https:"].includes(approvedUrl.protocol)
        || approvedUrl.username || approvedUrl.password
        || approvedUrl.search || approvedUrl.hash
        || (approvedUrl.pathname !== "/" && approvedUrl.pathname !== "")) {
        throw new Error("Invalid approved staging origin");
      }
      return approvedUrl.origin;
    } catch {
      throw new Error("Invalid approved staging origin");
    }
  }));
  if (!approved.has(parsed.origin)) {
    throw new Error("Staging origin is not explicitly approved");
  }
  return parsed.origin;
}

/**
 * Hard-stop before any staging SQL reconciliation query.
 * The caller must supply both the expected database and login; never accept
 * the legacy production database as a valid staging target.
 */
export function requireApprovedStagingDbIdentity(params: {
  actualDatabase: string;
  actualLogin: string;
  expectedDatabase: string;
  expectedLogin: string;
}): void {
  const expectedDb = params.expectedDatabase.trim();
  const expectedLogin = params.expectedLogin.trim();
  if (!expectedDb || !expectedLogin
    || expectedDb.toLowerCase() === "last132"
    || !/(staging|stage|test|sandbox|agent|ci|dev)/i.test(expectedDb)) {
    throw new Error("Staging SQL identity must explicitly select an isolated non-production database");
  }
  if (params.actualDatabase.toLowerCase() !== expectedDb.toLowerCase()
    || params.actualLogin.toLowerCase() !== expectedLogin.toLowerCase()) {
    throw new Error("Staging SQL database or login identity mismatch");
  }
}
