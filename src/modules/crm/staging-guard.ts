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
  const hostname = parsed.hostname.toLowerCase().replace(/^\\[|\\]$/g, "");
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
      return new URL(origin).origin;
    } catch {
      throw new Error("Invalid approved staging origin");
    }
  }));
  if (!approved.has(parsed.origin)) {
    throw new Error("Staging origin is not explicitly approved");
  }
  return parsed.origin;
}
