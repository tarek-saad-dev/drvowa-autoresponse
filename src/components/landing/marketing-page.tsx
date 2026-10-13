import Link from "next/link";
import { Suspense } from "react";
import { BrandLogo } from "@/components/brand/brand-logo";
import { LandingPricing } from "./pricing";
import s from "./landing.module.css";

const steps = [
  {
    n: "01",
    title: "عرّفه على شغلك",
    text: "ضيف خدماتك وأسعارك ومواعيدك وسياساتك. رتّب المعلومات اللي المساعد يرجع لها في ردوده.",
    tag: "المعرفة",
    example:
      "مواعيدنا من ١٠ صباحًا لـ١٠ مساءً. الاستبدال خلال ١٤ يوم بالفاتورة.",
  },
  {
    n: "02",
    title: "خلّي له أسلوبك",
    text: "حدّد نبرة الكلام وتعليمات الرد، وإمتى يحتاج يرجع لفريقك. وراجع ردوده قبل التشغيل.",
    tag: "الشخصية والصلاحيات",
    example:
      "اتكلم بالمصري وباختصار. لو العميل طلب خصم خاص، حوّل المحادثة للموظف.",
  },
  {
    n: "03",
    title: "اربط واتساب وتابع",
    text: "اربط حساب واتساب من لوحة التحكم. تابع المحادثات وتدخّل لما العميل يحتاجك.",
    tag: "التشغيل والمتابعة",
    example:
      "محادثات العملاء في مكان واحد. تقدر توقف ردود المساعد وتكمّل بنفسك.",
  },
];
const faqs = [
  [
    "أقدر أجرّبه قبل ما أشترك؟",
    "أيوه. ابدأ بإنشاء حساب على الخطة المجانية وجرّب إعداد المساعد. حدود الاستخدام لكل باقة موضّحة في قسم الأسعار، وتقدر تراجعها داخل حسابك.",
  ],
  [
    "المساعد هيعرف معلومات شغلي منين؟",
    "من المعلومات اللي بتضيفها له: الخدمات والأسعار والمواعيد والسياسات والأسئلة المتكررة. كل ما كانت معلوماتك واضحة ومحدّثة، ساعدته يرد بشكل أنسب.",
  ],
  [
    "ولو العميل محتاج يتكلم مع حد؟",
    "تقدر تتدخل وتكمّل المحادثة بنفسك. ومع إعداد تنبيهات التدخل البشري، توصلك الحالات اللي محتاجة متابعة على رقم المسؤول اللي تحدده.",
  ],
  [
    "هل ممكن يجاوب غلط؟",
    "الذكاء الاصطناعي ممكن يخطئ. راجع معلومات المساعد وجرّب ردوده وحدّد الحالات اللي لازم يرجع لك فيها، خصوصًا الأسعار الاستثنائية والوعود والحجوزات.",
  ],
  [
    "هل بيؤكد حجوزات أو ينفّذ طلبات لوحده؟",
    "تنفيذ إجراء فعلي بيحتاج تكامل مفعّل وصلاحيات مناسبة. مجرد الرد في المحادثة مش معناه إن الحجز أو الطلب اتسجل؛ التأكيد لازم يعتمد على نتيجة النظام المتصل.",
  ],
  [
    "إيه الفرق بين الردود والرسائل في الباقة؟",
    "ردود الذكاء الاصطناعي هي الردود اللي المساعد بيولّدها. ورسائل واتساب الصادرة هي الرسائل اللي بتتبعت من حسابك. كل عدّاد له حد منفصل حسب الباقة.",
  ],
];
function TrialLink({
  secondary = false,
  children = "ابدأ تجربة مجانية",
}: {
  secondary?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <Link className={secondary ? s.secondary : s.primary} href="/signup">
      {children}
      <span aria-hidden="true">←</span>
    </Link>
  );
}
function HeroScene() {
  return (
    <figure
      className={s.scene}
      aria-label="مثال توضيحي: تعليم المساعد ثم الرد على العميل ثم تنبيه المسؤول"
    >
      <div className={s.sceneTop}>
        <span>
          <i /> مساعدك في قلب المحادثة
        </span>
        <small>مثال توضيحي</small>
      </div>
      <div className={s.sceneCards}>
        <article className={`${s.glassCard} ${s.knowledgeCard}`}>
          <span className={s.cardNumber}>01</span>
          <span className={s.cardIcon} aria-hidden="true">
            ▤
          </span>
          <h3>يتعلّم شغلك</h3>
          <p>المعلومة تبدأ منك.</p>
          <div className={s.knowledgeNote}>
            دي خدماتنا، أسعارنا، ومواعيدنا.
            <br />
            ولو العميل طلب خصم، ارجع لي.
          </div>
          <div className={s.saved}>
            <span>✓</span> معلومات واضحة.
            <br /> ردود من سياق نشاطك.
          </div>
          <div className={s.miniTags}>
            <span>الأسعار</span>
            <span>المواعيد</span>
            <span>السياسات</span>
          </div>
        </article>
        <article className={`${s.glassCard} ${s.chatCard}`}>
          <span className={s.cardNumber}>02</span>
          <div className={s.chatHeader}>
            <span className={s.avatar}>D</span>
            <div>
              <h3>يردّ بطريقتك</h3>
              <p>مساعد نشاطك · واتساب</p>
            </div>
            <i />
          </div>
          <div className={s.chatBody}>
            <div className={s.incoming}>
              مساء الخير، بتقفلوا الساعة كام؟<small>10:24 م</small>
            </div>
            <div className={s.outgoing}>
              أهلًا بيك! مواعيدنا من ١٠ الصبح لـ١٠ بالليل.
              <small>10:24 م · ✓✓</small>
            </div>
            <div className={s.incoming}>
              طب فيه خصم لو طلبت كمية؟<small>10:25 م</small>
            </div>
            <div className={s.outgoing}>
              هحوّل طلبك للمسؤول عشان يراجع معاك السعر المناسب.
              <small>10:25 م · ✓✓</small>
            </div>
          </div>
          <div className={s.chatInput}>
            <span>الرد من معلوماتك. والقرار ليك.</span>
            <b aria-hidden="true">↗</b>
          </div>
        </article>
        <article className={`${s.glassCard} ${s.alertCard}`}>
          <span className={s.cardNumber}>03</span>
          <span className={`${s.cardIcon} ${s.alertIcon}`} aria-hidden="true">
            !
          </span>
          <h3>ويرجع لك وقت اللزوم</h3>
          <p>اللي محتاجك، يوصلك.</p>
          <div className={s.alertNote}>
            <b>محادثة محتاجة تدخّلك</b>
            <span>طلب سعر خاص لكمية كبيرة</span>
          </div>
          <div className={s.customer}>
            <span className={s.avatar}>ع</span>
            <div>
              <b>عميل بانتظار المتابعة</b>
              <small>سبب التصعيد واضح قدامك</small>
            </div>
          </div>
          <div className={s.mockButton}>
            متابعة المحادثة <span>←</span>
          </div>
        </article>
      </div>
      <figcaption>علّمه مرة، وحدّث معلوماته كل ما شغلك يتغيّر.</figcaption>
    </figure>
  );
}
export function MarketingPage() {
  return (
    <div className={s.page}>
      <a className={s.skip} href="#main">
        انتقل للمحتوى
      </a>
      <header className={s.header}>
        <div className={s.headerInner}>
          <Link href="/" aria-label="DRVO AutoRespond الرئيسية">
            <BrandLogo surface="dark" priority className={s.logo} />
          </Link>
          <nav className={s.desktopNav} aria-label="التنقل الرئيسي">
            <a href="#how-it-works">طريقة الاستخدام</a>
            <a href="#control">إنت المتحكّم</a>
            <a href="#pricing">الأسعار</a>
            <a href="#faq">الأسئلة الشائعة</a>
          </nav>
          <div className={s.headerActions}>
            <Link className={s.login} href="/login">
              تسجيل الدخول
            </Link>
            <TrialLink />
            <details className={s.mobileMenu}>
              <summary aria-label="فتح قائمة التنقل">☰</summary>
              <nav aria-label="تنقل الموبايل">
                <a href="#how-it-works">طريقة الاستخدام</a>
                <a href="#pricing">الأسعار</a>
                <a href="#faq">الأسئلة الشائعة</a>
                <Link href="/login">تسجيل الدخول</Link>
              </nav>
            </details>
          </div>
        </div>
      </header>
      <main id="main">
        <section className={`${s.container} ${s.hero}`}>
          <div className={s.heroCopy}>
            <span className={s.pill}>
              <i /> مساعد واتساب يعرف شغلك
            </span>
            <h1>
              عميلك بيسأل.
              <br />
              <span>خليك حاضر،</span>
              <br />
              حتى وإنت مشغول.
            </h1>
            <p>
              مش لازم تفضل ماسك الموبايل عشان تتابع كل رسالة. علّم DRVO تفاصيل
              نشاطك، يردّ على عملائك بطريقتك، ويرجع لك لما المحادثة تحتاج
              تدخّلك.
            </p>
            <div className={s.actions}>
              <TrialLink />
              <a className={s.textLink} href="#how-it-works">
                شوف بيشتغل إزاي <span aria-hidden="true">↙</span>
              </a>
            </div>
            <div className={s.heroBenefits}>
              <span>✓ يبدأ بخطة مجانية</span>
              <span>✓ معلوماتك وأسلوبك</span>
              <span>✓ التدخّل في إيدك</span>
            </div>
          </div>
          <HeroScene />
        </section>
        <div className={s.promiseStrip}>
          <div className={s.container}>
            <p>
              رسائل أكتر.
              <br />
              <strong>ضغط أقل عليك.</strong>
            </p>
            <span>
              الأسئلة المتكررة
              <br />
              <b>المساعد يردّ عليها</b>
            </span>
            <span>
              تفاصيل نشاطك
              <br />
              <b>في سياق المحادثة</b>
            </span>
            <span>
              الحالات الخاصة
              <br />
              <b>ترجع لقرارك</b>
            </span>
          </div>
        </div>
        <section id="how-it-works" className={`${s.container} ${s.section}`}>
          <div className={s.sectionHeading}>
            <div>
              <span className={s.eyebrow}>من أول معلومة لأول محادثة</span>
              <h2>
                تبدأ إزاي؟
                <br />
                <span>٣ خطوات واضحة.</span>
              </h2>
            </div>
            <p>
              إنت عارف شغلك أحسن من أي حد.
              <br />
              انقل المعرفة دي لمساعدك، وحدّد له طريقة التعامل.
            </p>
          </div>
          <div className={s.steps}>
            {steps.map((step) => (
              <article className={s.step} key={step.n}>
                <div className={s.stepTop}>
                  <span>{step.n}</span>
                  <small>{step.tag}</small>
                </div>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
                <div className={s.example}>
                  <span>مثال توضيحي</span>
                  <p>{step.example}</p>
                </div>
              </article>
            ))}
          </div>
          <div className={s.inlineCta}>
            <span>ابدأ بالمعلومات الأساسية، وطوّر مساعدك مع الاستخدام.</span>
            <TrialLink />
          </div>
        </section>
        <section id="control" className={s.controlSection}>
          <div className={`${s.container} ${s.controlGrid}`}>
            <div>
              <span className={s.eyebrow}>المساعد يردّ. وإنت تدير.</span>
              <h2>
                شغلك ماشي.
                <br />
                <span>والقرار لسه في إيدك.</span>
              </h2>
              <p className={s.lead}>
                مش كل سؤال محتاج وقتك، لكن فيه مواقف محتاجة قرارك. خلّي للمساعد
                حدود واضحة، وخليك موجود في اللحظة المناسبة.
              </p>
              <a className={s.textLink} href="#pricing">
                اختار البداية المناسبة ليك ←
              </a>
            </div>
            <div className={s.controlCards}>
              {[
                [
                  "01",
                  "المعرفة من عندك",
                  "خدماتك وأسعارك وسياساتك هي مرجع الرد. راجعها وحدّثها من لوحة التحكم.",
                ],
                [
                  "02",
                  "صلاحيات تحدّدها إنت",
                  "حدّد تعليمات المساعد والحالات اللي تستدعي تدخل بشري. وراجع ردوده قبل الاعتماد عليه.",
                ],
                [
                  "03",
                  "المتابعة توصلك",
                  "اضبط رقم المسؤول لتنبيهات التدخل البشري، مع رابط واتساب العميل ورابط محادثته داخل DRVO.",
                ],
              ].map(([n, title, text]) => (
                <article key={n}>
                  <span>{n}</span>
                  <div>
                    <h3>{title}</h3>
                    <p>{text}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>
        <section id="pricing" className={`${s.container} ${s.section}`}>
          <div className={s.centerHeading}>
            <span className={s.eyebrow}>باقات واضحة. حسب حجم شغلك.</span>
            <h2>
              جرّبه مجانًا.
              <br />
              <span>وكبّر مع احتياجك.</span>
            </h2>
            <p>قارن السعر وحدود الاستخدام، واختار الباقة المناسبة لنشاطك.</p>
            <span className={s.billingLabel}>اشتراك شهري</span>
          </div>
          <Suspense
            fallback={
              <div className={s.pricingNotice} role="status">
                جاري تحميل الباقات والأسعار الحالية…
              </div>
            }
          >
            <LandingPricing />
          </Suspense>
          <p className={s.pricingFootnote}>
            الأسعار وحدود الاستخدام من كتالوج الباقات الحالي. راجع تفاصيل الباقة
            داخل حسابك قبل الاشتراك.
          </p>
        </section>
        <section id="faq" className={`${s.container} ${s.faqSection}`}>
          <div>
            <span className={s.eyebrow}>قبل ما تبدأ</span>
            <h2>
              أسئلة في بالك؟
              <br />
              <span>خلّينا نوضح.</span>
            </h2>
          </div>
          <div className={s.faqs}>
            {faqs.map(([q, a]) => (
              <details key={q}>
                <summary>
                  {q}
                  <span aria-hidden="true">+</span>
                </summary>
                <p>{a}</p>
              </details>
            ))}
          </div>
        </section>
        <section className={s.container}>
          <div className={s.finalCta}>
            <span className={s.eyebrow}>
              وقت أقل في تكرار الردود. مساحة أكبر لشغلك.
            </span>
            <h2>
              خلّي أول محادثة
              <br />
              <span>بداية لشغل أهدى.</span>
            </h2>
            <p>اعمل حسابك، عرّف مساعدك على نشاطك، وجرّبه بنفسك.</p>
            <TrialLink />
            <small>ابدأ على الخطة المجانية.</small>
          </div>
        </section>
      </main>
      <footer className={`${s.container} ${s.footer}`}>
        <div>
          <BrandLogo surface="dark" className={s.logo} />
          <p>معلوماتك. بطريقتك. تحت إدارتك.</p>
        </div>
        <nav aria-label="روابط أسفل الصفحة">
          <a href="#pricing">الأسعار</a>
          <Link href="/privacy">الخصوصية</Link>
          <Link href="/terms">الشروط</Link>
          <Link href="/login">تسجيل الدخول</Link>
        </nav>
        <small>DRVO TECH © {new Date().getFullYear()}</small>
      </footer>
    </div>
  );
}
