"use client";

import { useEffect, useRef, type ReactNode } from "react";
import s from "./landing.module.css";

const revealSelector = [
  `.${s.heroCopy} > *`,
  `.${s.scene}`,
  `.${s.promiseStrip} .${s.container} > *`,
  `.${s.sectionHeading} > *`,
  `.${s.step}`,
  `.${s.inlineCta}`,
  `.${s.controlGrid} > div:first-child`,
  `.${s.controlCards} article`,
  `.${s.centerHeading} > *`,
  `.${s.plan}`,
  `.${s.pricingNotice}`,
  `.${s.faqSection} > div:first-child`,
  `.${s.faqs} details`,
  `.${s.finalCta} > *`,
  `.${s.footer} > *`,
].join(",");

/** Enhancement only: server-rendered content stays visible without JavaScript. */
export function LandingMotion({ children }: { children: ReactNode }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const animations = new Set<Animation>();
    const seen = new WeakSet<Element>();
    let frame = 0;
    const observer = new IntersectionObserver(
      (entries) => {
        let delay = 0;
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          observer.unobserve(entry.target);
          if (preference.matches || !(entry.target instanceof HTMLElement))
            continue;
          const animation = entry.target.animate(
            [
              { opacity: 0, transform: "translateY(24px)" },
              { opacity: 1, transform: "translateY(0)" },
            ],
            {
              duration: 650,
              delay: Math.min(delay++ * 65, 260),
              easing: "cubic-bezier(.22,1,.36,1)",
              fill: "backwards",
            },
          );
          animations.add(animation);
          animation.onfinish = () => animations.delete(animation);
        }
      },
      { threshold: 0.12 },
    );
    const register = () =>
      root.querySelectorAll(revealSelector).forEach((element) => {
        if (!seen.has(element)) {
          seen.add(element);
          observer.observe(element);
        }
      });
    register();
    // Pricing is streamed; register cards that arrive after hydration, too.
    const mutations = new MutationObserver(register);
    mutations.observe(root, { childList: true, subtree: true });
    const scene = root.querySelector(`.${s.scene}`);
    const sceneObserver = new IntersectionObserver(([entry]) => {
      if (scene instanceof HTMLElement)
        scene.dataset.active = String(entry.isIntersecting);
    });
    if (scene) sceneObserver.observe(scene);

    const updateProgress = () => {
      frame = 0;
      const range = document.documentElement.scrollHeight - innerHeight;
      if (progressRef.current)
        progressRef.current.style.transform = `scaleX(${range > 0 ? Math.min(1, Math.max(0, scrollY / range)) : 0})`;
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(updateProgress);
    };
    const onPreference = () => {
      if (preference.matches) {
        animations.forEach((a) => a.cancel());
        animations.clear();
      }
    };
    const onClick = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const link =
        event.target instanceof Element
          ? event.target.closest<HTMLAnchorElement>('a[href^="#"]')
          : null;
      if (!link) return;
      const id = link.getAttribute("href")?.slice(1);
      const target = id ? document.getElementById(id) : null;
      if (!target) return;
      event.preventDefault();
      root
        .querySelector<HTMLDetailsElement>(`.${s.mobileMenu}`)
        ?.removeAttribute("open");
      history.pushState(null, "", `#${id}`);
      // Focus the destination for keyboard users without a second scroll jump.
      if (!target.hasAttribute("tabindex")) {
        target.setAttribute("tabindex", "-1");
        target.addEventListener(
          "blur",
          () => target.removeAttribute("tabindex"),
          { once: true },
        );
      }
      target.focus({ preventScroll: true });
      target.scrollIntoView({
        behavior: preference.matches ? "instant" : "smooth",
        block: "start",
      });
    };
    const resize = new ResizeObserver(onScroll);
    resize.observe(root);
    root.addEventListener("click", onClick);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    preference.addEventListener("change", onPreference);
    updateProgress();
    return () => {
      observer.disconnect();
      sceneObserver.disconnect();
      mutations.disconnect();
      resize.disconnect();
      animations.forEach((a) => a.cancel());
      cancelAnimationFrame(frame);
      root.removeEventListener("click", onClick);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      preference.removeEventListener("change", onPreference);
      if (scene instanceof HTMLElement) delete scene.dataset.active;
    };
  }, []);

  return (
    <div className={s.page} ref={rootRef}>
      <div ref={progressRef} className={s.scrollProgress} aria-hidden="true" />
      {children}
    </div>
  );
}
