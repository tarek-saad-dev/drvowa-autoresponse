import { ValidationError } from "@/lib/tenancy/errors";

/**
 * The app runs behind Nginx. `request.url` may contain an internal listener
 * (e.g. http://127.0.0.1:3100) even for genuine browser requests from
 * https://app.drvotech.com. Never use request.url or untrusted X-Forwarded-Host
 * as the CSRF origin authority.
 *
 * Exact public admin origins are deployment-controlled, never browser headers.
 */
const DEFAULT_ADMIN_ORIGIN = "https://app.drvotech.com";
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function assertBrandAdminSameOrigin(request: Request): void {
  const originHeader = request.headers.get("origin");
  if (!originHeader) {
    throw new ValidationError("طلب التعديل لازم يكون من نفس موقع الإدارة.");
  }

  let origin: URL;
  try {
    origin = new URL(originHeader);
  } catch {
    throw new ValidationError("طلب التعديل لازم يكون من نفس موقع الإدارة.");
  }

  // A browser's Origin is just scheme + host (+ port), never path or credentials.
  if (origin.origin !== originHeader || origin.username || origin.password) {
    throw new ValidationError("طلب التعديل لازم يكون من نفس موقع الإدارة.");
  }

  const configured = process.env.DRVO_ADMIN_PUBLIC_ORIGIN?.trim() || DEFAULT_ADMIN_ORIGIN;
  let allowed: URL;
  try {
    allowed = new URL(configured);
  } catch {
    throw new Error("DRVO_ADMIN_PUBLIC_ORIGIN must be a valid HTTPS origin");
  }
  if (allowed.protocol !== "https:" || allowed.origin !== configured) {
    throw new Error("DRVO_ADMIN_PUBLIC_ORIGIN must be an exact HTTPS origin");
  }

  if (origin.origin === allowed.origin) return;

  // Development-only: permit a matching loopback origin, not arbitrary Host
  // or proxy forwarding headers controlled by untrusted clients.
  const host = request.headers.get("host");
  if (
    process.env.NODE_ENV !== "production" &&
    LOCAL_HOSTS.has(origin.hostname.toLowerCase()) &&
    (origin.protocol === "http:" || origin.protocol === "https:") &&
    host === origin.host
  ) {
    return;
  }
  throw new ValidationError("طلب التعديل لازم يكون من نفس موقع الإدارة.");
}
