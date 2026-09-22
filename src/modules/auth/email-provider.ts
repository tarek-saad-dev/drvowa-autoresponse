/**
 * Transactional email provider boundary.
 * Production send requires EXTERNAL_GATE_EMAIL_PROVIDER credentials.
 */

import { createConnection, type Socket } from "node:net";
import { connect as tlsConnect, type TLSSocket } from "node:tls";

export type EmailMessage = {
  to: string;
  subject: string;
  textBody: string;
  /** Optional HTML alternative (Resend + SMTP multipart). */
  htmlBody?: string;
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
 * Set EMAIL_PROVIDER=smtp|resend when credentials exist.
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

function readEnv(name: string): string {
  return (process.env[name] ?? "").trim();
}

export function hasResendCredentials(): boolean {
  return Boolean(readEnv("RESEND_API_KEY") && readEnv("EMAIL_FROM"));
}

export function hasSmtpCredentials(): boolean {
  return Boolean(
    readEnv("SMTP_HOST")
      && readEnv("SMTP_PORT")
      && readEnv("SMTP_USER")
      && readEnv("SMTP_PASS")
      && readEnv("EMAIL_FROM"),
  );
}

/** Resend HTTP API — no extra dependency. */
export class ResendEmailProvider implements EmailProvider {
  readonly name = "resend";

  async send(message: EmailMessage): Promise<EmailSendResult> {
    const apiKey = readEnv("RESEND_API_KEY");
    const from = readEnv("EMAIL_FROM");
    if (!apiKey || !from) {
      return {
        status: "DISABLED",
        reason: "EXTERNAL_GATE_EMAIL_PROVIDER",
      };
    }

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [message.to],
        subject: message.subject,
        text: message.textBody,
        ...(message.htmlBody ? { html: message.htmlBody } : {}),
      }),
    });

    if (!response.ok) {
      const status = response.status;
      // Never include response body (may contain recipient/provider detail).
      throw new Error(`Resend send failed (HTTP ${status})`);
    }

    const payload = (await response.json()) as { id?: string };
    return {
      status: "SENT",
      providerMessageId: payload.id,
    };
  }
}

type SmtpSocket = Socket | TLSSocket;

function smtpSecureFlag(): boolean {
  const raw = readEnv("SMTP_SECURE").toLowerCase();
  return raw === "true" || raw === "1" || raw === "yes";
}

function encodeSmtpAuth(user: string, pass: string): string {
  return Buffer.from(`\0${user}\0${pass}`, "utf8").toString("base64");
}

/** Extract bare address from `Name <user@domain>` or plain `user@domain`. */
export function extractEmailAddress(from: string): string {
  const angled = from.match(/<([^<>\s]+@[^<>\s]+)>/);
  if (angled?.[1]) return angled[1].trim();
  const plain = from.match(/([^\s<>]+@[^\s<>]+)/);
  return (plain?.[1] ?? from).replace(/[<>\r\n]/g, "").trim();
}

function quoteSmtpAddress(address: string): string {
  return `<${extractEmailAddress(address)}>`;
}

/**
 * Minimal Node-only SMTP client (AUTH PLAIN, SSL or STARTTLS).
 * Prefer a dedicated provider (Resend) in production when possible.
 */
export class SmtpEmailProvider implements EmailProvider {
  readonly name = "smtp";

  async send(message: EmailMessage): Promise<EmailSendResult> {
    if (!hasSmtpCredentials()) {
      return {
        status: "DISABLED",
        reason: "EXTERNAL_GATE_EMAIL_PROVIDER",
      };
    }

    const host = readEnv("SMTP_HOST");
    const port = Number(readEnv("SMTP_PORT"));
    const user = readEnv("SMTP_USER");
    const pass = readEnv("SMTP_PASS");
    const from = readEnv("EMAIL_FROM");
    const secure = smtpSecureFlag();

    if (!Number.isFinite(port) || port <= 0) {
      return {
        status: "DISABLED",
        reason: "EXTERNAL_GATE_EMAIL_PROVIDER",
      };
    }

    await sendViaSmtp({
      host,
      port,
      secure,
      user,
      pass,
      from,
      to: message.to,
      subject: message.subject,
      textBody: message.textBody,
      htmlBody: message.htmlBody,
    });

    return { status: "SENT" };
  }
}

async function sendViaSmtp(params: {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
  to: string;
  subject: string;
  textBody: string;
  htmlBody?: string;
}): Promise<void> {
  let socket: SmtpSocket = await connectSocket(params.host, params.port, params.secure);
  try {
    await expectCode(socket, 220);
    await writeLine(socket, `EHLO drvowa`);
    await readUntilDone(socket);

    if (!params.secure) {
      await writeLine(socket, "STARTTLS");
      await expectCode(socket, 220);
      socket = await upgradeToTls(socket, params.host);
      await writeLine(socket, `EHLO drvowa`);
      await readUntilDone(socket);
    }

    await writeLine(socket, "AUTH PLAIN " + encodeSmtpAuth(params.user, params.pass));
    await expectCode(socket, 235);

    await writeLine(socket, `MAIL FROM:${quoteSmtpAddress(params.from)}`);
    await expectCode(socket, 250);
    await writeLine(socket, `RCPT TO:${quoteSmtpAddress(params.to)}`);
    await expectCode(socket, 250);
    await writeLine(socket, "DATA");
    await expectCode(socket, 354);

    const subject = params.subject.replace(/[\r\n]/g, "");
    const text = params.textBody.replace(/^\./gm, "..");
    const html = params.htmlBody?.replace(/^\./gm, "..");
    let bodyBlock: string;
    if (html) {
      const boundary = `drvowa_${Date.now().toString(36)}`;
      bodyBlock = [
        `Content-Type: multipart/alternative; boundary="${boundary}"`,
        "",
        `--${boundary}`,
        "Content-Type: text/plain; charset=utf-8",
        "",
        text,
        `--${boundary}`,
        "Content-Type: text/html; charset=utf-8",
        "",
        html,
        `--${boundary}--`,
      ].join("\r\n");
    } else {
      bodyBlock = ["Content-Type: text/plain; charset=utf-8", "", text].join(
        "\r\n",
      );
    }

    const headers = [
      `From: ${params.from}`,
      `To: ${params.to}`,
      `Subject: ${subject}`,
      "MIME-Version: 1.0",
      bodyBlock,
      ".",
    ].join("\r\n");
    await writeRaw(socket, headers + "\r\n");
    await expectCode(socket, 250);
    await writeLine(socket, "QUIT");
  } finally {
    socket.destroy();
  }
}

function connectSocket(
  host: string,
  port: number,
  secure: boolean,
): Promise<SmtpSocket> {
  return new Promise((resolve, reject) => {
    const onError = (err: Error) => reject(err);
    if (secure) {
      const sock = tlsConnect({ host, port, servername: host }, () => {
        sock.off("error", onError);
        resolve(sock);
      });
      sock.once("error", onError);
      return;
    }
    const sock = createConnection({ host, port }, () => {
      sock.off("error", onError);
      resolve(sock);
    });
    sock.once("error", onError);
  });
}

function upgradeToTls(socket: SmtpSocket, host: string): Promise<TLSSocket> {
  return new Promise((resolve, reject) => {
    const tlsSocket = tlsConnect(
      { socket: socket as Socket, servername: host },
      () => resolve(tlsSocket),
    );
    tlsSocket.once("error", reject);
  });
}

function writeLine(socket: SmtpSocket, line: string): Promise<void> {
  return writeRaw(socket, line + "\r\n");
}

function writeRaw(socket: SmtpSocket, data: string): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.write(data, "utf8", (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

function readChunk(socket: SmtpSocket): Promise<string> {
  return new Promise((resolve, reject) => {
    const onData = (buf: Buffer) => {
      cleanup();
      resolve(buf.toString("utf8"));
    };
    const onError = (err: Error) => {
      cleanup();
      reject(err);
    };
    const cleanup = () => {
      socket.off("data", onData);
      socket.off("error", onError);
    };
    socket.once("data", onData);
    socket.once("error", onError);
  });
}

async function expectCode(socket: SmtpSocket, code: number): Promise<string> {
  const response = await readUntilDone(socket);
  if (!response.startsWith(String(code))) {
    throw new Error(`SMTP unexpected response (wanted ${code})`);
  }
  return response;
}

async function readUntilDone(socket: SmtpSocket): Promise<string> {
  let buffer = "";
  for (;;) {
    buffer += await readChunk(socket);
    const lines = buffer.split(/\r?\n/).filter((l) => l.length > 0);
    if (lines.length === 0) continue;
    const last = lines[lines.length - 1]!;
    // Multi-line SMTP replies use "250-..." then final "250 ..."
    if (/^\d{3}[\s-]/.test(last) && last.charAt(3) === " ") {
      return buffer;
    }
    if (/^\d{3} /.test(last)) {
      return buffer;
    }
  }
}

export function getEmailProvider(): EmailProvider {
  const mode = readEnv("EMAIL_PROVIDER").toLowerCase();

  if (mode === "local" || mode === "dev") {
    return new LocalDevEmailProvider();
  }

  if (mode === "resend") {
    return hasResendCredentials()
      ? new ResendEmailProvider()
      : new GatedProductionEmailProvider();
  }

  if (mode === "smtp") {
    return hasSmtpCredentials()
      ? new SmtpEmailProvider()
      : new GatedProductionEmailProvider();
  }

  // Unset / unknown: non-production defaults to local logging; production stays gated.
  if (process.env.NODE_ENV !== "production") {
    return new LocalDevEmailProvider();
  }
  return new GatedProductionEmailProvider();
}

/**
 * True only when a real external email provider would deliver mail.
 * Local/dev adapters log only and must not be presented as delivery.
 */
export function isEmailDeliveryEnabled(): boolean {
  const mode = readEnv("EMAIL_PROVIDER").toLowerCase();
  if (mode === "resend") return hasResendCredentials();
  if (mode === "smtp") return hasSmtpCredentials();
  return false;
}
