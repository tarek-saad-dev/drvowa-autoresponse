export type IntegrationToolMode = "READ" | "WRITE";
export type IntegrationToolApproval =
  | "AUTO"
  | "CUSTOMER_CONFIRM"
  | "HUMAN_APPROVAL";

export type IntegrationToolDefinition = {
  name: string;
  description: string;
  mode: IntegrationToolMode;
  approval: IntegrationToolApproval;
  inputSchema?: Record<string, unknown>;
};

export type IntegrationManifest = {
  contractVersion: "drvowa-erp-v1";
  provider: string;
  providerVersion?: string | null;
  capabilities: string[];
  tools: IntegrationToolDefinition[];
};

export type IntegrationToolCallResult = {
  ok: boolean;
  tool: string;
  data?: unknown;
  error?: {
    code: string;
    message: string;
  };
};
