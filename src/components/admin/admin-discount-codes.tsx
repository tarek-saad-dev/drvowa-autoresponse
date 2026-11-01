"use client";
import { useCallback, useEffect, useState } from "react";

type DiscountRow = {
  Code:string;Kind:"PERCENT"|"FIXED";Value:number;MaxRedemptions:number|null;
  PlanCode:string|null;BillingInterval:string|null;ExpiresAtUtc:string|null;
  IsActive:boolean;Reserved:number;Redeemed:number;
};
type FormData = {
  code:string;kind:"PERCENT"|"FIXED";value:string;maxRedemptions:string;
  planCode:string;billingInterval:string;expiresAt:string;
};
const initial:FormData={code:"",kind:"PERCENT",value:"20",maxRedemptions:"25",
  planCode:"",billingInterval:"",expiresAt:""};

export function AdminDiscountCodes(){
  const [items,setItems]=useState<DiscountRow[]>([]);
  const [form,setForm]=useState<FormData>(initial);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const reload=useCallback(async()=>{
    const response=await fetch("/api/admin/discount-codes",{cache:"no-store"});
    const result=await response.json();
    if(!response.ok) throw new Error(result.error ?? "تعذر تحميل الأكواد");
    setItems(result.codes??[]);
  },[]);
  useEffect(()=>{void reload().catch(e=>setError(e instanceof Error?e.message:"تعذر التحميل"));},[reload]);
  async function call(body:Record<string,unknown>){
    setBusy(true);setError("");setNotice("");
    try{
      const response=await fetch("/api/admin/discount-codes",{
        method:"POST",headers:{"Content-Type":"application/json"},
        credentials:"same-origin",body:JSON.stringify(body)});
      const result=await response.json();
      if(!response.ok) throw new Error(result.error??"تعذر حفظ الكود");
      await reload();setNotice("تم حفظ التعديل بنجاح");
      if(body.action==="create")setForm(initial);
    }catch(e){setError(e instanceof Error?e.message:"حدث خطأ");}
    finally{setBusy(false);}
  }
  return <div className="grid gap-5 xl:grid-cols-[minmax(300px,380px)_minmax(0,1fr)]">
    <form className="space-y-4 rounded-2xl border border-border bg-card p-5"
      onSubmit={e=>{e.preventDefault();void call({
        action:"create",code:form.code.toUpperCase().trim(),kind:form.kind,
        value:Number(form.value),
        maxRedemptions:form.maxRedemptions?Number(form.maxRedemptions):null,
        planCode:form.planCode||null,billingInterval:form.billingInterval||null,
        startsAtUtc:null,expiresAtUtc:form.expiresAt?new Date(form.expiresAt).toISOString():null,
      });}}>
      <div><h2 className="text-lg font-bold">إنشاء كود خصم</h2>
      <p className="mt-1 text-xs text-muted-foreground">خصم على الاشتراكات المدفوعة فقط، وليس رصيد الردود الإضافي.</p></div>
      <label className="block text-sm font-semibold">الكود
        <input className="mt-1 w-full rounded-lg border border-border bg-background p-2 font-mono uppercase"
          dir="ltr" required minLength={3} maxLength={32} pattern="[A-Za-z0-9_-]{3,32}"
          value={form.code} placeholder="DRVO20" onChange={e=>setForm({...form,code:e.target.value.toUpperCase()})}/>
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm">نوع الخصم
          <select className="mt-1 w-full rounded-lg border border-border bg-background p-2"
            value={form.kind} onChange={e=>setForm({...form,kind:e.target.value as FormData["kind"]})}>
            <option value="PERCENT">نسبة %</option><option value="FIXED">مبلغ بالجنيه</option>
          </select>
        </label>
        <label className="block text-sm">القيمة
          <input className="mt-1 w-full rounded-lg border border-border bg-background p-2"
            type="number" required min={0.01} max={form.kind==="PERCENT"?90:100000}
            step={0.01} value={form.value} onChange={e=>setForm({...form,value:e.target.value})}/>
        </label>
      </div>
      <label className="block text-sm">عدد الاستخدامات (اتركها فاضية بدون حد إجمالي)
        <input className="mt-1 w-full rounded-lg border border-border bg-background p-2"
          type="number" min={1} max={100000} value={form.maxRedemptions}
          onChange={e=>setForm({...form,maxRedemptions:e.target.value})}/>
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm">الباقة
          <select className="mt-1 w-full rounded-lg border border-border bg-background p-2"
            value={form.planCode} onChange={e=>setForm({...form,planCode:e.target.value})}>
            <option value="">كل الباقات</option><option value="STARTER">Starter</option>
            <option value="PRO">Pro</option><option value="BUSINESS">Business</option>
          </select>
        </label>
        <label className="block text-sm">المدة
          <select className="mt-1 w-full rounded-lg border border-border bg-background p-2"
            value={form.billingInterval} onChange={e=>setForm({...form,billingInterval:e.target.value})}>
            <option value="">شهري وسنوي</option><option value="MONTHLY">شهري فقط</option>
            <option value="ANNUAL">سنوي فقط</option>
          </select>
        </label>
      </div>
      <label className="block text-sm">ينتهي في (اختياري)
        <input className="mt-1 w-full rounded-lg border border-border bg-background p-2"
          type="datetime-local" value={form.expiresAt} onChange={e=>setForm({...form,expiresAt:e.target.value})}/>
      </label>
      <p className="text-xs leading-6 text-muted-foreground">الكود مرة واحدة لكل نشاط. الاستخدامات المحجوزة في طلبات الدفع المفتوحة تتحسب ضمن الحد، والإلغاء بيرجّع المكان تلقائيًا. الخصم لا يقلل المبلغ النهائي لأقل من جنيه واحد.</p>
      <button disabled={busy} type="submit" className="w-full rounded-xl bg-primary px-4 py-3 font-bold text-primary-foreground disabled:opacity-50">
        {busy?"جاري الحفظ…":"إنشاء الكود"}
      </button>
    </form>
    <section className="min-w-0 space-y-3 rounded-2xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="text-lg font-bold">الأكواد الحالية</h2>
        <p className="text-xs text-muted-foreground">تقدر توقف الكود في أي لحظة، بدون التأثير على المدفوعات السابقة.</p></div>
        <button onClick={()=>void reload().catch(e=>setError(String(e)))} type="button"
          className="rounded-lg border border-border px-3 py-2 text-sm">تحديث</button>
      </div>
      {error?<p role="alert" className="text-sm text-destructive">{error}</p>:null}
      {notice?<p role="status" className="text-sm text-primary">{notice}</p>:null}
      {!items.length?<p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">مفيش أكواد خصم لسه.</p>:null}
      <div className="space-y-2">
        {items.map(item=><article key={item.Code} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-4">
          <div className="min-w-0">
            <b dir="ltr" className="block font-mono">{item.Code}</b>
            <p className="text-sm">{item.Kind==="PERCENT"?item.Value+"%":item.Value+" ج"} خصم
              {" · "}{item.PlanCode??"كل الباقات"}{" · "}{item.BillingInterval==="ANNUAL"?"سنوي":item.BillingInterval==="MONTHLY"?"شهري":"شهري وسنوي"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {item.Redeemed} مستخدم · {item.Reserved} مستخدم/محجوز
              {item.MaxRedemptions?" من "+item.MaxRedemptions:""}
              {item.ExpiresAtUtc?" · ينتهي "+new Date(item.ExpiresAtUtc).toLocaleDateString("ar-EG"):""}
            </p>
          </div>
          <button type="button" disabled={busy}
            className="rounded-lg border border-border px-3 py-2 text-sm font-semibold disabled:opacity-50"
            onClick={()=>void call({action:"toggle",code:item.Code,active:!item.IsActive})}>
            {item.IsActive?"إيقاف الكود":"إعادة تفعيل"}
          </button>
        </article>)}
      </div>
    </section>
  </div>;
}
