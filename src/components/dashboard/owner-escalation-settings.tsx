"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type EscalationSetting = {
  phone: string | null;
  enabled: boolean;
  verified: boolean;
  notifyBotSelf?: boolean;
};

export function OwnerEscalationSettings({ initial }: { initial: EscalationSetting }) {
  const [phone, setPhone] = useState(initial.phone ?? "");
  const [setting, setSetting] = useState({
    ...initial,
    notifyBotSelf: initial.notifyBotSelf !== false,
  });
  const [code, setCode] = useState("");
  const [verificationRequested, setVerificationRequested] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  async function call(url: string, method: string, payload?: unknown) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const res = await fetch(url, {
        method,
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: payload === undefined ? undefined : JSON.stringify(payload),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "تعذّر تنفيذ العملية.");
      return body;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "حدث خطأ، حاول مرة تانية.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  const base = "/api/escalations/settings";
  const savedNumber = phone.trim() === (setting.phone ?? "");
  const isVerified = savedNumber && setting.verified;
  const canVerify = Boolean(setting.phone) && savedNumber && !setting.verified;

  return (
    <section aria-label="إعدادات تنبيهات التدخل البشري" className="space-y-4">
      <p className="text-sm leading-6 text-muted-foreground">
        لما محادثة تحتاج تدخل بشري، نقدر نبعت تنبيه على واتساب المسؤول برابط المحادثة.
      </p>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Label htmlFor="escalation-owner-phone">رقم واتساب المسؤول</Label>
          {isVerified ? (
            <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400">✓ الرقم مؤكد</span>
          ) : null}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            id="escalation-owner-phone"
            type="tel"
            dir="ltr"
            inputMode="tel"
            className="text-start"
            value={phone}
            placeholder="2010XXXXXXXX"
            onChange={(event) => {
              setPhone(event.target.value);
              setVerificationRequested(false);
              setCode("");
              setNotice("");
            }}
          />
          <Button
            type="button"
            variant="outline"
            className="shrink-0"
            disabled={busy || !phone.trim() || savedNumber}
            onClick={async () => {
              const result = await call(base, "PATCH", {
                phone: phone.trim(),
                enabled: false,
                notifyBotSelf: setting.notifyBotSelf,
              });
              if (result?.setting) {
                setSetting({
                  ...result.setting,
                  notifyBotSelf: result.setting.notifyBotSelf !== false,
                });
                setPhone(result.setting.phone ?? phone.trim());
                setVerificationRequested(false);
                setCode("");
                setNotice("اتحفظ الرقم. أكّده علشان تشغّل التنبيهات.");
              }
            }}
          >
            حفظ الرقم
          </Button>
        </div>

        {canVerify ? (
          <div className="space-y-3 rounded-xl bg-surface p-3">
            <p className="text-xs text-muted-foreground">
              أكّد الرقم مرة واحدة علشان التنبيهات توصلك عليه.
            </p>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={async () => {
                const result = await call(base + "/verify", "POST");
                if (result?.sent) {
                  setVerificationRequested(true);
                  setNotice("بعتنالك كود التأكيد على واتساب. صالح لمدة 10 دقائق.");
                }
              }}
            >
              {verificationRequested ? "إعادة إرسال الكود" : "إرسال كود التأكيد"}
            </Button>
            {verificationRequested ? (
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  aria-label="كود التأكيد"
                  inputMode="numeric"
                  dir="ltr"
                  maxLength={6}
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  placeholder="كود من 6 أرقام"
                  className="max-w-44 text-start"
                />
                <Button
                  type="button"
                  disabled={busy || !/^\d{6}$/.test(code)}
                  onClick={async () => {
                    const result = await call(base + "/verify", "PATCH", { code });
                    if (result?.verified) {
                      setSetting((current) => ({ ...current, verified: true }));
                      setCode("");
                      setVerificationRequested(false);
                      setNotice("تم تأكيد الرقم. تقدر دلوقتي تشغّل التنبيهات.");
                    } else if (result) {
                      setError("الكود غير صحيح أو انتهت صلاحيته.");
                    }
                  }}
                >
                  تأكيد الرقم
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {isVerified ? (
        <div className="space-y-2 border-t border-border pt-4">
          <label className="flex cursor-pointer items-center gap-3 rounded-xl bg-surface p-3 text-sm font-bold">
            <input
              type="checkbox"
              className="h-4 w-4 shrink-0 accent-primary"
              checked={setting.enabled}
              disabled={busy}
              onChange={async (event) => {
                const enabled = event.currentTarget.checked;
                const result = await call(base, "PATCH", {
                  phone,
                  enabled,
                  notifyBotSelf: setting.notifyBotSelf,
                });
                if (result?.setting) {
                  setSetting({
                    ...result.setting,
                    notifyBotSelf: result.setting.notifyBotSelf !== false,
                  });
                  setNotice(enabled ? "تم تفعيل التنبيهات." : "تم إيقاف التنبيهات.");
                }
              }}
            />
            إشعاري لما عميل يحتاج تدخل بشري
          </label>
          {setting.enabled ? (
            <label className="flex cursor-pointer items-center gap-3 rounded-xl bg-surface p-3 text-sm font-bold">
              <input
                type="checkbox"
                className="h-4 w-4 shrink-0 accent-primary"
                checked={setting.notifyBotSelf}
                disabled={busy}
                onChange={async (event) => {
                  const notifyBotSelf = event.currentTarget.checked;
                  const result = await call(base, "PATCH", {
                    phone,
                    enabled: setting.enabled,
                    notifyBotSelf,
                  });
                  if (result?.setting) {
                    setSetting({
                      ...result.setting,
                      notifyBotSelf: result.setting.notifyBotSelf !== false,
                    });
                    setNotice(
                      notifyBotSelf
                        ? "تم تفعيل نسخة التنبيه على محادثة رقم البوت."
                        : "تم إيقاف نسخة التنبيه على محادثة رقم البوت.",
                    );
                  }
                }}
              />
              إرسال نسخة من التنبيه على محادثة رقم البوت
            </label>
          ) : null}
        </div>
      ) : null}

      {error ? <p role="alert" className="text-xs font-bold text-red-600">{error}</p> : null}
      {notice ? <p role="status" className="text-xs font-bold text-emerald-700 dark:text-emerald-400">{notice}</p> : null}
    </section>
  );
}
