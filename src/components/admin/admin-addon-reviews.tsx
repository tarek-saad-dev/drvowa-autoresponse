"use client";
import { useState } from "react";
type Item={OrderID:string;BusinessID:string;AddonCode:string;Quantity:number;AmountEgp:number;PaymentReference:string|null;PayerName:string|null;TransferReference:string|null;Status:string};
export function AdminAddonReviews() {
 const [items,setItems]=useState<Item[]>([]);
 const [loading,setLoading]=useState(false);
 const [error,setError]=useState("");
 async function load(){
  setLoading(true);setError("");
  try{const r=await fetch("/api/admin/addons",{cache:"no-store"});
   if(!r.ok)throw new Error("تعذر تحميل الطلبات");
   setItems((await r.json()).items??[]);
  }catch(e){setError(e instanceof Error?e.message:"حدث خطأ");}
  finally{setLoading(false);}
 }
 async function review(item:Item,decision:"APPROVED"|"REJECTED"){
  if(!window.confirm(decision==="APPROVED"?"هل راجعت التحويل فعليًا؟ الموافقة لا تمنح الإضافة بعد.":"رفض طلب الإضافة؟"))return;
  setLoading(true);setError("");
  try{const r=await fetch("/api/admin/addons",{method:"POST",
   headers:{"Content-Type":"application/json"},
   body:JSON.stringify({orderId:item.OrderID,decision,verifiedTransfer:true})});
   if(!r.ok)throw new Error("تعذرت مراجعة الطلب");
   setItems(old=>old.filter(x=>x.OrderID!==item.OrderID));
  }catch(e){setError(e instanceof Error?e.message:"حدث خطأ");}
  finally{setLoading(false);}
 }
 return <section className="space-y-4 rounded-xl border border-border bg-card p-5">
  <div><h2 className="font-bold">مراجعة إضافات الاستخدام</h2><p className="text-sm text-muted-foreground">راجع التحويل خارج النظام قبل الموافقة. اعتماد الطلب لا يمنح الرصيد تلقائيًا حتى اكتمال الربط.</p></div>
  <button className="rounded-lg border border-border px-4 py-2 text-sm" type="button" disabled={loading} onClick={()=>void load()}>تحميل الطلبات المعلقة</button>
  {error?<p role="alert" className="text-sm text-destructive">{error}</p>:null}
  {items.length===0?<p className="text-sm text-muted-foreground">لا توجد طلبات محملة.</p>:null}
  <div className="space-y-3">{items.map(x=><article className="space-y-2 rounded-lg border border-border p-3" key={x.OrderID}>
   <p className="font-semibold">{x.AddonCode} · {x.AmountEgp} ج</p>
   <p className="text-xs text-muted-foreground" dir="ltr">{x.PaymentReference} · {x.BusinessID}</p>
   <p className="text-sm">المحوّل: {x.PayerName??"—"} · المرجع: {x.TransferReference??"—"}</p>
   <div className="flex gap-2">
    <button type="button" disabled={loading} className="rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground" onClick={()=>void review(x,"APPROVED")}>اعتماد بعد التحقق</button>
    <button type="button" disabled={loading} className="rounded-lg border border-border px-3 py-2 text-sm" onClick={()=>void review(x,"REJECTED")}>رفض</button>
   </div>
  </article>)}</div>
 </section>;
}
