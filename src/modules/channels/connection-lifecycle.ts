/**
 * Map WhatsApp runtime socket state → durable ChannelConnection Status/IsActive.
 *
 * Lifecycle rules:
 * - READY → ACTIVE / IsActive=true (authoritative paired+connected)
 * - LOGGED_OUT → DISCONNECTED / false
 * - intentional STOPPED → DISCONNECTED / false (user disconnect)
 * - admin INACTIVE is preserved unless READY or LOGGED_OUT
 * - transient CONNECTING/STARTING/DISCONNECTED keep ACTIVE if previously ACTIVE (sticky reconnect)
 * - first-time QR/STARTING/CONNECTING → PENDING / false
 */
export function mapDbStatusFromRuntime(
  state: string,
  previous?: { status: string; isActive: boolean } | null,
): { status: "PENDING" | "ACTIVE" | "INACTIVE" | "ERROR" | "DISCONNECTED"; isActive: boolean } {
  const prevStatus = previous?.status ?? null;
  const prevActive = Boolean(previous?.isActive);

  if (prevStatus === "INACTIVE" && state !== "READY" && state !== "LOGGED_OUT") {
    return { status: "INACTIVE", isActive: false };
  }

  switch (state) {
    case "READY":
      return { status: "ACTIVE", isActive: true };
    case "LOGGED_OUT":
      return { status: "DISCONNECTED", isActive: false };
    case "ERROR":
      return { status: "ERROR", isActive: false };
    case "STOPPED":
      // Intentional stop/disconnect from dashboard — not PENDING.
      return { status: "DISCONNECTED", isActive: false };
    case "DISCONNECTED":
    case "CONNECTING":
    case "STARTING":
      if (prevStatus === "ACTIVE" || prevActive) {
        return { status: "ACTIVE", isActive: true };
      }
      return { status: "PENDING", isActive: false };
    case "QR_REQUIRED":
      return { status: "PENDING", isActive: false };
    default:
      if (prevStatus === "ACTIVE" || prevActive) {
        return { status: "ACTIVE", isActive: true };
      }
      return { status: "PENDING", isActive: false };
  }
}
