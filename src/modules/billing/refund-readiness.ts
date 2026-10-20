/**
 * A refund must never be processed while any configured financial consumer
 * would silently miss its reversal. This is a fail-closed activation policy.
 */
export function isRefundProcessingAllowed(options: {
  hubCaptureEnabled: boolean;
  refundCaptureEnabled: boolean;
  hubSourceConfigured: boolean;
  financeExportConfigured: boolean;
  refundConsumerReady: boolean;
}): boolean {
  if (options.refundCaptureEnabled && !options.hubCaptureEnabled) return false;
  if (options.hubCaptureEnabled && (!options.refundCaptureEnabled || !options.hubSourceConfigured)) return false;
  if (options.financeExportConfigured && !options.refundConsumerReady) return false;
  return true;
}
