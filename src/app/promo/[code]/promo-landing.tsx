"use client";
import { useState } from "react";
import Link from "next/link";
import styles from "./promo.module.css";

type Offer={code:string;name:string;replies:number;knowledge:number;monthly:number;
  annual:number|null;monthlyAfter:number|null;annualAfter:number|null};
type PromoProps={
  code:string;kind:"PERCENT"|"FIXED";value:number;
  partnerName:string|null;planCode:string|null;
  billingInterval:"MONTHLY"|"ANNUAL"|null;
  expiresAtUtc:string|null;remaining:number|null;
  offers:Offer[];
};

const egp=(amount:number)=>new Intl.NumberFormat("en-EG",{maximumFractionDigits:2}).format(amount);
export function PromoLanding({code,kind,value,partnerName,planCode,billingInterval,expiresAtUtc,remaining,offers}:PromoProps){
 const [interval,setInterval]=useState<"MONTHLY"|"ANNUAL">(billingInterval??"MONTHLY");
 const canMonthly=billingInterval!=="ANNUAL"&&offers.some(p=>p.monthlyAfter!==null);
 const canAnnual=billingInterval!=="MONTHLY"&&offers.some(p=>p.annualAfter!==null);
 const activeInterval=(interval==="ANNUAL"&&canAnnual)||!canMonthly?"ANNUAL":"MONTHLY";
 const applicable=offers.filter(p=>activeInterval==="ANNUAL"?p.annualAfter!==null:p.monthlyAfter!==null);
 const subtitle=partnerName?`دعوة خاصة من ${partnerName}`:"عرض خاص للي وصلوا من الرابط ده";
 const hint=kind==="PERCENT"?`${egp(value)}%`:`${egp(value)} ج`;
 return <main dir="rtl" className={styles.page}>
   <header className={styles.header}>
     <Link className={styles.wordmark} href="/" aria-label="DRVO AutoResponse الرئيسية">DRVO<span>AutoResponse</span></Link>
     <span className={styles.headerLabel}>INVITATION ONLY <span aria-hidden="true">✦</span></span>
   </header>
   <section className={styles.hero}>
     <div className={styles.heroCopy}>
       <div className={styles.kicker}><span className={styles.liveDot}/> {subtitle}</div>
       <h1>خلي شغلك يرد.<br/><span>حتى وإنت مشغول.</span></h1>
       <p className={styles.lead}>مساعد واتساب ذكي يتعلم شغلك ويرد على عملائك بطريقتك. العرض ده معمول عشان تبدأ بتكلفة أقل من السعر المعتاد.</p>
       <div className={styles.codeBox}>
         <div><small>كود عرضك الخاص</small><strong dir="ltr">{code}</strong></div>
         <button type="button" onClick={()=>void navigator.clipboard?.writeText(code)}>نسخ الكود</button>
       </div>
       <div className={styles.offerMeta}>
         <span>✓ خصم على أول اشتراك مدفوع</span>
         <span>✓ دفع بعد تجهيز نشاطك</span>
         {expiresAtUtc?<span>✓ صالح حتى {new Date(expiresAtUtc).toLocaleDateString("ar-EG",{day:"numeric",month:"long",year:"numeric",timeZone:"UTC"})}</span>:null}
         {remaining!==null?<span>✓ متاح لـ {remaining.toLocaleString("en-US")} طلب جديد</span>:null}
       </div>
     </div>
     <div className={styles.discountVisual}>
       <div className={styles.orbit} aria-hidden="true"/>
       <p>YOUR PRIVATE OFFER</p>
       <div className={styles.discountNumber} dir="ltr">{hint}</div>
       <div className={styles.discountTitle}>خصم مخصوص ليك</div>
       <div className={styles.discountUnderline}/>
       <p className={styles.discountSmall}>استخدم الكود عند الاشتراك لأول مرة</p>
     </div>
   </section>

   <section id="offers" className={styles.offers}>
     <div className={styles.offersHead}>
       <div><span className={styles.eyebrow}>PICK YOUR PLAN</span><h2>نفس الخدمة. <em>بسعر مختلف.</em></h2>
         <p>الأرقام دي بعد تطبيق الكود، وليست أسعارًا دائمة للتجديد.</p>
       </div>
       {canMonthly&&canAnnual?<div className={styles.interval} role="group" aria-label="مدة الاشتراك">
         <button type="button" aria-pressed={activeInterval==="MONTHLY"} onClick={()=>setInterval("MONTHLY")}>شهري</button>
         <button type="button" aria-pressed={activeInterval==="ANNUAL"} onClick={()=>setInterval("ANNUAL")}>سنوي</button>
       </div>:null}
     </div>
     <div className={styles.cards}>
      {applicable.map(plan=>{
       const before=activeInterval==="ANNUAL"?plan.annual!:plan.monthly;
       const after=activeInterval==="ANNUAL"?plan.annualAfter!:plan.monthlyAfter!;
       return <article className={plan.code==="PRO"?styles.featured:styles.card} key={plan.code}>
         <div className={styles.cardTop}><span>{plan.code}</span>{plan.code==="PRO"?<b>الأكثر توازنًا</b>:null}</div>
         <h3>{plan.name}</h3>
         <p className={styles.cardIntro}>{egp(plan.replies)} رد ذكي / شهر</p>
         <div className={styles.previous}>بدل <s dir="ltr">{egp(before)} ج</s></div>
         <div className={styles.current}><strong dir="ltr">{egp(after)}</strong><span>جنيه / {activeInterval==="MONTHLY"?"شهر":"سنة"}</span></div>
         <div className={styles.saving}>هتوفّر {egp(before-after)} جنيه على الاشتراك ده</div>
         <ul><li>رقم واتساب واحد</li><li>{egp(plan.replies)} رد ذكي شهريًا</li><li>{egp(plan.knowledge)} معلومة للنشاط</li></ul>
         <Link className={styles.cardCta} href={`/promo/${encodeURIComponent(code)}/activate?plan=${encodeURIComponent(plan.code)}&interval=${activeInterval}`}>
           استفيد من العرض <span aria-hidden="true">←</span>
         </Link>
       </article>;
      })}
     </div>
     {planCode?<p className={styles.scope}>الكود مخصص لباقة {planCode} فقط.</p>:null}
     <div className={styles.disclaimer}>الخصم على طلب اشتراك واحد لكل نشاط، وغير قابل للجمع مع خصم إداري. بعد انتهاء الاشتراك يكون التجديد بالسعر الساري وقتها ما لم يتوفر عرض جديد. صلاحية الكود وتوافره بيتم التحقق منهم عند تجهيز طلب الدفع، ومفيش تحويل مطلوب قبل مراجعة المبلغ النهائي.</div>
   </section>
   <footer className={styles.footer}><Link href="/">DRVO AutoResponse</Link><span>ذكاء بيرد نيابة عنك. والتحكم يفضل في إيدك.</span></footer>
 </main>;
}
