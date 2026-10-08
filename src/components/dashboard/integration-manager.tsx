"use client";

import { useMemo, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type IntegrationView = {
  integrationId: string;
  type: string;
  status: string;
  externalReference: string | null;
  baseUrl?: string | null;
  capabilitiesJson?: string | null;
  lastHealthAtUtc?: string | Date | null;
  lastHealthStatus?: string | null;
};

export function IntegrationManager({
  initialIntegration,
}: {
  initialIntegration: IntegrationView | null;
}) {
  const [baseUrl, setBaseUrl] = useState(initialIntegration?.baseUrl ?? "");
  const [token, setToken] = useState("");
  const [externalReference, setExternalReference] = useState(
    initialIntegration?.externalReference ?? "",
  );
  const [integration, setIntegration] = useState(initialIntegration);
  const [inboundKey, setInboundKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [pairingExpiresAt, setPairingExpiresAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const tools = useMemo(() => {
    if (!integration?.capabilitiesJson) return [];
    try {
      const parsed = JSON.parse(integration.capabilitiesJson) as {
        tools?: Array<{ name: string; mode: string; approval: string }>;
      };
      return parsed.tools ?? [];
    } catch {
      return [];
    }
  }, [integration]);

  async function createPairingCode() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/integrations/drvo-erp/pairing", {
        method: "POST",
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data?.error ?? "تعذر إنشاء كود الربط");
        return;
      }
      setPairingCode(data.pairingCode ?? null);
      setPairingExpiresAt(data.expiresAtUtc ?? null);
    } catch {
      setError("تعذر إنشاء كود الربط.");
    } finally {
      setBusy(false);
    }
  }

  async function connect() {
    setBusy(true);
    setError(null);
    setInboundKey(null);
    try {
      const response = await fetch("/api/integrations/drvo-erp/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseUrl,
          outboundToken: token,
          externalReference: externalReference || null,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data?.error ?? "تعذر ربط الـ ERP");
        return;
      }
      setIntegration(data.integration);
      setInboundKey(data.inboundApiKey ?? null);
      setToken("");
      if (data.manifest) {
        setIntegration((current) =>
          current
            ? { ...current, capabilitiesJson: JSON.stringify(data.manifest) }
            : current,
        );
      }
    } catch {
      setError("تعذر الاتصال. حاول مرة أخرى.");
    } finally {
      setBusy(false);
    }
  }

  async function refreshManifest() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/integrations/drvo-erp/manifest", {
        method: "POST",
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data?.error ?? "تعذر فحص الـ ERP");
        return;
      }
      setIntegration((current) =>
        current
          ? {
              ...current,
              capabilitiesJson: JSON.stringify(data.manifest),
              lastHealthStatus: "HEALTHY",
              lastHealthAtUtc: new Date().toISOString(),
            }
          : current,
      );
    } catch {
      setError("تعذر فحص الاتصال.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      {error ? <Alert variant="error">{error}</Alert> : null}

      <section className="rounded-[26px] border border-primary/20 bg-primary/[0.025] p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black text-primary">الربط السريع</p>
            <h2 className="mt-1 text-xl font-black">Pairing Code</h2>
            <p className="mt-2 max-w-2xl text-sm leading-7 text-muted-foreground">
              ولّد كود مؤقت وحطه في صفحة DRVOWA داخل الـ ERP. النظامين هيتبادلوا المفاتيح ويعملوا الربط تلقائيًا من غير نقل API keys يدوي.
            </p>
          </div>
          <Button
            type="button"
            disabled={busy}
            onClick={() => void createPairingCode()}
          >
            {busy ? "جاري الإنشاء..." : pairingCode ? "كود جديد" : "إنشاء كود ربط"}
          </Button>
        </div>

        {pairingCode ? (
          <div className="mt-5 rounded-2xl border border-primary/20 bg-card p-4">
            <div className="text-[11px] font-black text-muted-foreground">
              الكود صالح لمدة 15 دقيقة ولمرة واحدة
            </div>
            <div dir="ltr" className="mt-2 font-mono text-2xl font-black tracking-[0.16em] text-primary sm:text-3xl">
              {pairingCode}
            </div>
            {pairingExpiresAt ? (
              <div className="mt-2 text-[11px] text-muted-foreground">
                ينتهي: {new Date(pairingExpiresAt).toLocaleTimeString("ar-EG", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </div>
            ) : null}
            <div className="mt-4 rounded-xl bg-surface/60 px-3 py-2.5 text-xs leading-6 text-muted-foreground">
              افتح في الـ ERP: <b>الإدارة ← Integrations ← DRVOWA</b>، والصق الكود ده واضغط ربط.
            </div>
          </div>
        ) : null}
      </section>

      <section className="rounded-[26px] border border-border bg-card p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black text-primary">DRVO ERP Connector</p>
            <h2 className="mt-1 text-xl font-black">اربط DRVOWA بالـ ERP</h2>
            <p className="mt-2 max-w-2xl text-sm leading-7 text-muted-foreground">
              الـ ERP يقدر يبعت Events ورسائل، وDRVOWA يقدر يقرأ بيانات وينفذ Actions من خلال Tools محددة.
            </p>
          </div>
          <span className={
            `rounded-full px-3 py-1.5 text-xs font-black ${
              integration?.status === "ACTIVE"
                ? "bg-success-soft text-success"
                : "bg-secondary text-muted-foreground"
            }`
          }>
            {integration?.status === "ACTIVE" ? "متصل" : "غير متصل"}
          </span>
        </div>

        <div className="mt-6 grid gap-4">
          <div>
            <label className="text-xs font-black">ERP Base URL</label>
            <Input
              dir="ltr"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://ops.example.com"
              className="mt-2"
            />
          </div>
          <div>
            <label className="text-xs font-black">ERP Access Token</label>
            <Input
              dir="ltr"
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Bearer token configured in the ERP"
              className="mt-2"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              بيتخزن مشفر على السيرفر ومش بيظهر تاني في الـ UI.
            </p>
          </div>
          <div>
            <label className="text-xs font-black">External Reference — اختياري</label>
            <Input
              value={externalReference}
              onChange={(e) => setExternalReference(e.target.value)}
              placeholder="مثال: CUT-SALON-PROD"
              className="mt-2"
            />
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <Button
            type="button"
            disabled={busy || !baseUrl.trim() || !token.trim()}
            onClick={() => void connect()}
          >
            {busy ? "جاري الربط..." : integration ? "تحديث الاتصال" : "ربط الـ ERP"}
          </Button>
          {integration ? (
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => void refreshManifest()}
            >
              فحص الـ Capabilities
            </Button>
          ) : null}
        </div>
      </section>

      {inboundKey ? (
        <Alert variant="warning" title="احفظ المفتاح ده في الـ ERP دلوقتي">
          <p className="text-xs leading-6">
            المفتاح بيتعرض مرة واحدة فقط. حطه في <code>DRVOWA_INBOUND_API_KEY</code> داخل الـ ERP.
          </p>
          <div dir="ltr" className="mt-3 overflow-x-auto rounded-xl bg-card p-3 text-xs font-mono">
            {inboundKey}
          </div>
        </Alert>
      ) : null}

      {integration ? (
        <section className="rounded-[26px] border border-border bg-card p-5 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-black">Capabilities</p>
              <p className="mt-1 text-xs text-muted-foreground">
                الأدوات اللي الـ ERP معلن إن DRVOWA يقدر يستخدمها.
              </p>
            </div>
            <span className="text-[11px] font-bold text-muted-foreground">
              {integration.lastHealthStatus ?? "غير مفحوص"}
            </span>
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {tools.length > 0 ? tools.map((tool) => (
              <div key={tool.name} className="rounded-2xl border border-border bg-surface/40 p-4">
                <div className="flex items-center justify-between gap-2">
                  <code className="text-xs font-black">{tool.name}</code>
                  <span className={
                    `rounded-full px-2 py-1 text-[9px] font-black ${
                      tool.mode === "READ"
                        ? "bg-primary/10 text-primary"
                        : "bg-warning-soft text-warning"
                    }`
                  }>
                    {tool.mode}
                  </span>
                </div>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  {tool.approval === "AUTO"
                    ? "يتنفذ تلقائيًا"
                    : tool.approval === "CUSTOMER_CONFIRM"
                      ? "يحتاج تأكيد العميل"
                      : "يحتاج موافقة موظف"}
                </p>
              </div>
            )) : (
              <p className="text-sm text-muted-foreground">
                اعمل فحص للاتصال علشان نحمّل الأدوات المتاحة.
              </p>
            )}
          </div>
        </section>
      ) : null}
    </div>
  );
}
