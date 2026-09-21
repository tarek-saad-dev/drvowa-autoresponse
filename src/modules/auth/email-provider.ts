/**
 * Transactional email provider boundary.
 * Production send requires EXTERNAL_GATE_EMAIL_PROVIDER credentials.
 */

export type EmailMessage = {
  to: string;
  subject: string;
  textBody: string;
};

export type EmailSendResult =
  | { status: "SENT"; providerMessageId?: string }
  | { status: "QUEUED_LOCAL"; reason: string }
  | { status: "DISABLED"; reason: string };

export interface EmailProvider {
  readonly name: string;
  send(message: EmailMessage): Promise<EmailSendResult>;
}

/** Dev/local adapter — never sends externally; logs safe metadata only. */
export class LocalDevEmailProvider implements EmailProvider {
  readonly name = "local-dev";

  async send(message: EmailMessage): Promise<EmailSendResult> {
    const domain = message.to.includes("@")
      ? message.to.split("@")[1]
      : "unknown";
    console.info("[email:local-dev]", {
      toDomain: domain,
      subject: message.subject,
      bodyChars: message.textBody.length,
    });
    return {
      status: "QUEUED_LOCAL",
      reason: "LOCAL_DEV_ADAPTER",
    };
  }
}

/**
 * Production stub — refuses to send until a real provider is configured.
 * Set EMAIL_PROVIDER=smtp|resend|ses etc. when credentials exist.
 */
export class GatedProductionEmailProvider implements EmailProvider {
  readonly name = "gated-production";

  async send(_message: EmailMessage): Promise<EmailSendResult> {
    void _message;
    return {
      status: "DISABLED",
      reason: "EXTERNAL_GATE_EMAIL_PROVIDER",
    };
  }
}

export function getEmailProvider(): EmailProvider {
  const mode = (process.env.EMAIL_PROVIDER ?? "").toLowerCase();
  // Non-production defaults to local logging adapter.
  if (process.env.NODE_ENV !== "production") {
    return new LocalDevEmailProvider();
  }
  // Production: explicit local/dev still logs only (ops override).
  if (mode === "local" || mode === "dev") {
    return new LocalDevEmailProvider();
  }
  // No real SMTP/Resend/SES adapter wired yet — refuse external send.
  return new GatedProductionEmailProvider();
}

/**
 * True only when a real external email provider would deliver mail.
 * Local/dev adapters log only and must not be presented as delivery.
 */
export function isEmailDeliveryEnabled(): boolean {
  void (process.env.EMAIL_PROVIDER ?? "");
  // Real provider adapters are not implemented yet (EXTERNAL_GATE_EMAIL_PROVIDER).
  return false;
}
