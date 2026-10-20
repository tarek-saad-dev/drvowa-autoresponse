import { readSaasFinancialConfig, type SaasFinancialConfig } from "./saas-financial-config";

type Environment = Readonly<Record<string, string | undefined>>;
const SOURCE_ACTIVATED_AT = "2026-10-18T04:59:46.821598Z";

/** The admin transition and production smoke must evaluate the same inputs. */
export function refundReadinessOptions(
  env: Environment,
  financial: SaasFinancialConfig | null,
  financeExportConfigured: boolean,
) {
  return {
    hubCaptureEnabled: env.DRVO_SAAS_FINANCIAL_CAPTURE_ENABLED !== undefined
      && env.DRVO_SAAS_FINANCIAL_CAPTURE_ENABLED !== "0",
    refundCaptureEnabled: env.DRVO_SAAS_FINANCIAL_REFUND_CAPTURE_ENABLED === "1",
    hubSourceConfigured: financial?.captureEnabled === true && financial.sourceStatus === "active"
      && financial.sourceKey === "drvo-autorespond"
      && financial.sourceActivatedAt === SOURCE_ACTIVATED_AT
      && !!financial.captureCutoffAt,
    financeExportConfigured,
    refundConsumerReady: env.DRVO_GROUP_FINANCE_REFUNDS_CONSUMER_READY === "1",
  };
}

/** The production smoke is a deployment gate for the already active payment capture. */
export function productionRefundReadiness(
  env: Environment,
  financeExportConfigured: boolean,
) {
  if (env.DRVO_SAAS_FINANCIAL_CAPTURE_ENABLED !== "1") {
    throw new Error("Production financial capture configuration is missing or disabled");
  }
  if (env.DRVO_SAAS_FINANCIAL_REFUND_CAPTURE_ENABLED !== undefined
    && env.DRVO_SAAS_FINANCIAL_REFUND_CAPTURE_ENABLED !== "0"
    && env.DRVO_SAAS_FINANCIAL_REFUND_CAPTURE_ENABLED !== "1") {
    throw new Error("Invalid production refund capture configuration");
  }
  const financial = readSaasFinancialConfig(env);
  const options = refundReadinessOptions(env, financial, financeExportConfigured);
  if (!options.hubSourceConfigured) {
    throw new Error("Production financial source configuration is invalid");
  }
  return {
    refundCaptureEnabled: options.refundCaptureEnabled,
    refundActionsEnabled: isRefundProcessingAllowed(options),
  };
}

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
