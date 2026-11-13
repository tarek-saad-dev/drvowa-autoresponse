"use client";

import Image from "next/image";
import { useCallback, useEffect, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";

type Variant = "primary-dark" | "primary-light" | "compact" | "stacked" | "icon";
type Asset = {
  id: string;
  variant: Variant;
  fileName: string;
  mimeType: string;
  size: number;
  active: boolean;
  uploadedAt: string;
  activatedAt: string | null;
};
const SLOTS: { id: Variant; title: string; help: string; light: boolean }[] = [
  { id: "primary-dark", title: "الشعار الأساسي — خلفية داكنة", help: "للهيدر الداكن والـSidebar", light: false },
  { id: "primary-light", title: "الشعار الأساسي — خلفية فاتحة", help: "لصفحات الدخول والـLight Mode", light: true },
  { id: "compact", title: "Compact — الشعار الأفقي الصغير", help: "للمساحات الضيقة والموبايل", light: false },
  { id: "stacked", title: "Stacked — الشعار الرأسي", help: "للمواد التسويقية والمربعة", light: false },
  { id: "icon", title: "Icon Only — أيقونة التطبيق", help: "لأيقونة التطبيق والمشاركة الاجتماعية", light: false },
];

export function AdminBrandAssets() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [selected, setSelected] = useState<Partial<Record<Variant, File>>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    const response = await fetch("/api/admin/brand-assets", { cache: "no-store", credentials: "same-origin" });
    const body = await response.json() as { assets?: Asset[]; error?: string };
    if (!response.ok) throw new Error(body.error || "تعذر تحميل الشعارات.");
    setAssets(body.assets ?? []);
  }, []);

  useEffect(() => {
    let alive = true;
    fetch("/api/admin/brand-assets", { cache: "no-store", credentials: "same-origin" })
      .then(async (res) => {
        const data = await res.json() as { assets?: Asset[]; error?: string };
        if (!res.ok) throw new Error(data.error || "تعذر تحميل الشعارات.");
        return data.assets ?? [];
      })
      .then((rows) => { if (alive) setAssets(rows); })
      .catch((e: unknown) => { if (alive) setError(e instanceof Error ? e.message : "تعذر التحميل."); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const refresh = async () => { await load(); };

  async function upload(event: FormEvent<HTMLFormElement>, variant: Variant) {
    event.preventDefault();
    const file = selected[variant];
    if (!file) return setError("اختار صورة الأول.");
    if (file.size > 2 * 1024 * 1024) return setError("الصورة أكبر من 2 MB.");
    const formElement = event.currentTarget;
    setBusy(variant); setError(""); setNotice("");
    try {
      const form = new FormData();
      form.set("variant", variant);
      form.set("file", file);
      const response = await fetch("/api/admin/brand-assets", { method: "POST", body: form, credentials: "same-origin" });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "تعذر رفع الصورة.");
      await refresh();
      setSelected((old) => ({ ...old, [variant]: undefined }));
      formElement.reset();
      setNotice("تم الرفع كمسودة. راجع المعاينة واضغط «اعتماد» لنشرها.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر رفع الصورة.");
    } finally { setBusy(null); }
  }

  async function act(asset: Asset, action: "publish" | "delete") {
    if (action === "publish" &&
      !window.confirm("هيتم استبدال الشعار المنشور فورًا في الموقع والتطبيق. هل تعتمد النسخة دي؟")) return;
    if (action === "delete" && !window.confirm("حذف المسودة دي نهائيًا؟")) return;
    setBusy(asset.id); setError(""); setNotice("");
    try {
      const response = await fetch("/api/admin/brand-assets/" + encodeURIComponent(asset.id), {
        method: action === "publish" ? "PATCH" : "DELETE",
        headers: action === "publish" ? { "Content-Type": "application/json" } : undefined,
        body: action === "publish" ? JSON.stringify({ action: "publish" }) : undefined,
        credentials: "same-origin",
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "تعذر حفظ التعديل.");
      await refresh();
      setNotice(action === "publish"
        ? "تم نشر اللوجو الجديد. اعمل Refresh للصفحات المفتوحة لمشاهدة النسخة."
        : "تم حذف المسودة.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر حفظ التعديل.");
    } finally { setBusy(null); }
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-border bg-card p-4 text-sm leading-7 text-muted-foreground sm:p-5">
        ارفع كل Variant منفصلًا بصيغة <strong className="text-foreground">PNG / JPG / WebP</strong>، وبحجم أقصاه
        {" "}<strong className="text-foreground">2 MB</strong>. يفضل PNG بخلفية شفافة.
        أولًا ارفع الصورة كمسودة، وعاينها، وبعدها اضغط <strong className="text-foreground">اعتماد ونشر</strong>.
        النسخة القديمة بتفضل محفوظة وتقدر ترجع لها في أي وقت. ملفات SVG مش مدعومة حفاظًا على الأمان.
      </div>
      {error ? <p role="alert" className="rounded-xl border border-destructive/25 bg-destructive-soft p-3 text-sm text-destructive">{error}</p> : null}
      {notice ? <p role="status" className="rounded-xl border border-success/25 bg-success-soft p-3 text-sm text-success">{notice}</p> : null}
      {loading ? <p role="status" className="text-muted-foreground">جاري تحميل مكتبة الهوية...</p> : null}
      <div className="grid min-w-0 gap-5 lg:grid-cols-2">
        {SLOTS.map((slot) => {
          const versions = assets.filter((asset) => asset.variant === slot.id);
          const current = versions.find((asset) => asset.active);
          return (
            <section key={slot.id} className="min-w-0 overflow-hidden rounded-2xl border border-border bg-card shadow-sm" aria-label={slot.title}>
              <header className="space-y-1 border-b border-border px-4 py-4 sm:px-5">
                <h2 className="font-display text-base font-bold">{slot.title}</h2>
                <p className="text-xs text-muted-foreground">{slot.help}</p>
                <p className="text-xs font-semibold text-primary">{current ? "نسخة معتمدة ونشطة" : "لسه مفيش نسخة منشورة — بيستخدم الشعار الافتراضي"}</p>
              </header>
              <div className={"flex h-40 items-center justify-center p-5 " + (slot.light ? "bg-[#f7f9fc]" : "bg-[#0b0f14]")}>
                <Image
                  src={"/api/brand/assets/" + slot.id + (current ? "?v=" + current.id : "")}
                  alt={"المعاينة الحالية — " + slot.title}
                  unoptimized
                  width={440}
                  height={160}
                  className="max-h-full w-auto max-w-full object-contain"
                />
              </div>
              <form onSubmit={(event) => void upload(event, slot.id)} className="space-y-3 border-y border-border px-4 py-4 sm:px-5">
                <label className="block text-sm font-semibold">
                  اختيار صورة جديدة
                  <input
                    name={"brand-" + slot.id}
                    type="file"
                    accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
                    className="mt-2 block w-full max-w-full rounded-xl border border-input bg-background p-2 text-xs text-foreground file:me-3 file:rounded-md file:border-0 file:bg-primary/10 file:px-3 file:py-2 file:font-bold file:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    onChange={(e) => setSelected((old) => ({ ...old, [slot.id]: e.target.files?.[0] }))}
                  />
                </label>
                <Button type="submit" size="sm" loading={busy === slot.id} disabled={busy !== null || !selected[slot.id]}>
                  رفع كمسودة
                </Button>
              </form>
              <div className="space-y-3 px-4 py-4 sm:px-5">
                <h3 className="text-sm font-bold">النسخ السابقة والمسودات</h3>
                {versions.length === 0 ? <p className="text-xs text-muted-foreground">مفيش ملفات مرفوعة لسه.</p> : null}
                {versions.map((asset) => (
                  <div key={asset.id} className="flex min-w-0 flex-col gap-3 rounded-xl border border-border bg-surface/50 p-3 sm:flex-row sm:items-center">
                    <div className={"grid h-20 w-28 shrink-0 place-items-center rounded-lg " + (slot.light ? "bg-white" : "bg-[#0b0f14]")}>
                      <Image
                        src={"/api/admin/brand-assets/" + asset.id + "/image"}
                        alt={"معاينة " + asset.fileName}
                        width={110}
                        height={76}
                        unoptimized
                        className="max-h-full w-auto max-w-full object-contain"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p dir="auto" className="break-all text-xs font-semibold">{asset.fileName}</p>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {(asset.size / 1024).toFixed(0)} KB · {new Date(asset.uploadedAt).toLocaleDateString("ar-EG")}
                      </p>
                      <span className={"mt-1 inline-block rounded-full px-2 py-1 text-[10px] font-bold " +
                        (asset.active ? "bg-success-soft text-success" : "bg-secondary text-secondary-foreground")}>
                        {asset.active ? "منشور" : "مسودة / نسخة سابقة"}
                      </span>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      {!asset.active ? (
                        <>
                          <Button size="sm" loading={busy === asset.id} disabled={busy !== null} onClick={() => void act(asset, "publish")}>اعتماد ونشر</Button>
                          <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => void act(asset, "delete")}>حذف</Button>
                        </>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
