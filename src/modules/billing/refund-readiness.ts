/**
 * A refund must never be processed while any configured financial consumer
 * would silently miss its reversal. This is a fail-closed activation policy.
 */
export function isRefundProcessingAllowed(options: {
  hubCaptureEnabled: boolean;
  financeExportConfigured: boolean;
  refundConsumerReady: boolean;
}): boolean {
  if (options.hubCaptureEnabled) return false;
  if (options.financeExportConfigured && !options.refundConsumerReady) return false;
  return true;
}
