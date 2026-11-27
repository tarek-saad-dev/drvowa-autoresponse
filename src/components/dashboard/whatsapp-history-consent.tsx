"use client";
import { useId } from "react";

export function WhatsAppHistoryConsent({ enabled, onChange, disabled }: {
  enabled: boolean; onChange: (enabled: boolean) => void; disabled?: boolean;
}) {
  const name = useId();
  return (
    <fieldset disabled={disabled} className="my-4 space-y-2 rounded-2xl border border-border p-4">
      <legend className="px-2 text-sm font-bold">خصوصية المحادثات القديمة</legend>
      <p className="text-xs text-muted-foreground">لو الرقم كان شخصي، تقدر تبدأ من غير ما تضيف سجل واتساب القديم إلى DRVO.</p>
      <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border p-3">
        <input type="radio" name={name} checked={!enabled} onChange={() => onChange(false)} />
        <span><span className="block text-sm font-bold">ابدأ من جديد (موصى به)</span><span className="block text-xs text-muted-foreground">عدم استيراد السجل القديم. المحادثات الموجودة بالفعل في DRVO لن تُحذف.</span></span>
      </label>
      <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border p-3">
        <input type="radio" name={name} checked={enabled} onChange={() => onChange(true)} />
        <span><span className="block text-sm font-bold">استيراد السجل المتاح</span><span className="block text-xs text-muted-foreground">قد يتضمن رسائل شخصية؛ اختره فقط لو عايز تضيف السجل.</span></span>
      </label>
      <p className="text-xs text-muted-foreground">لن يتم حذف أي رسائل من واتساب. الرسائل الجديدة قد تظهر في DRVO في الوضعين.</p>
    </fieldset>
  );
}
