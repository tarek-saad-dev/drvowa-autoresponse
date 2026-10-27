"use client";
import { useState } from "react";

type Order = { OrderID:string; AddonCode:string; Quantity:number; AmountEgp:number; Status:string; PaymentReference:string|null };
const choices=[
 {code:"replies_250",label:"250 رد إضافي",price:99},
 {code:"replies_1000",label:"1,000 رد إضافي",price:249},
 {code:"replies_3000",label:"3,000 رد إضافي",price:599},
 {code:"voice_60",label:"60 دقيقة صوت",price:79},
 {code:"voice_200",label:"200 دقيقة صوت",price:199},
];
export function AddonPurchasesClient() {
 const [orders,setOrders]=useState<Order[]>([]);
 const [loading,setLoading]=useState(false);
 const [error,setError]=useState("");
 const [selected,setSelected]=useState("");
 const [payer,setPayer]=useState("");
 const [reference,setReference]=useState("");
 const [draft,setDraft]=useState<string|null>(null);
 async function call(body?:Record<string,string>) {
  const response=await fetch("/api/billing/addons",{
   method:body?"POST":"GET",credentials:"same-origin",
   headers:body?{"Content-Type":"application/json"}:undefined,
   body:body?JSON.stringify(body):undefined,
  });
  if(!response.ok) throw new Error("تعذر إتمام العملية، راجع البيانات والمحاولة مرة أخرى.");
  return response.json();
 }
 async function run(action:()=>Promise<void>) {
  setLoading(true);setError("");
  try {await action();}catch(e){setError(e instanceof Error?e.message:"حدث خطأ");}
  finally {setLoading(false);}
 }
 return <section className="space-y-4 rounded-2xl border border-border bg-card p-5">
  <div><h2 className="font-bold">إضافات الاستخدام</h2><p className="text-sm text-muted-foreground">اطلب إضافة، ثم أرسل بيانات التحويل للمراجعة. تأكيد التحويل لا يعني اعتماد الدفع.</p></div>
  <div className="grid gap-3 sm:grid-cols-2">
   {choices.map(c=><button type="button" key={c.code} onClick={()=>{setSelected(c.code);setDraft(null);}}
    className={`rounded-xl border p-4 text-start transition-colors ${selected===c.code?"border-primary bg-primary/5":"border-border"}`}>
    <span className="block font-medium">{c.label}</span><span className="text-sm text-muted-foreground">{c.price} ج</span>
   </button>)}
  </div>
  {selected&&!draft?<button type="button" disabled={loading} className="rounded-xl bg-primary px-4 py-2 font-semibold text-primary-foreground" onClick={()=>run(async()=>{
   const result=await call({action:"create",addonCode:selected,idempotencyKey:crypto.randomUUID()});
   setDraft(result.orderId);
  })}>إنشاء طلب الإضافة</button>:null}
  {draft?<form className="space-y-3" onSubmit={e=>{e.preventDefault();void run(async()=>{
   await call({action:"confirm",orderId:draft,payerName:payer,transferReference:reference});
   setDraft(null);setSelected("");setPayer("");setReference("");
   const r=await call();setOrders(r.orders||[]);
  });}}>
   <p className="text-sm">مرجع الطلب: <b dir="ltr">{draft}</b></p>
   <label className="block text-sm">اسم المحوّل<input required maxLength={160} value={payer} onChange={e=>setPayer(e.target.value)} className="mt-1 w-full rounded-lg border border-border bg-background p-2"/></label>
   <label className="block text-sm">رقم عملية التحويل<input required maxLength={160} value={reference} onChange={e=>setReference(e.target.value)} className="mt-1 w-full rounded-lg border border-border bg-background p-2"/></label>
   <button disabled={loading} className="rounded-xl bg-primary px-4 py-2 font-semibold text-primary-foreground">إرسال تأكيد التحويل</button>
  </form>:null}
  {error?<p role="alert" className="text-sm text-destructive">{error}</p>:null}
  <button type="button" className="text-sm font-bold text-primary underline" disabled={loading} onClick={()=>run(async()=>{const r=await call();setOrders(r.orders||[]);})}>تحديث حالة طلباتي</button>
  {orders.length?<ul className="space-y-2">{orders.map(o=><li className="rounded-lg border border-border p-3 text-sm" key={o.OrderID}>{o.AddonCode} · {o.AmountEgp} ج · {o.Status}</li>)}</ul>:null}
 </section>;
}
