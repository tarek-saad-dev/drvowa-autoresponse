"use client";

import Script from "next/script";
import { createElement, useEffect, useRef, useState } from "react";

type LottieAssetProps = {
  src: string;
  className?: string;
  speed?: number;
  loop?: boolean;
  autoplay?: boolean;
  ariaLabel?: string;
};

export function LottieAsset({
  src,
  className = "",
  speed = 1,
  loop = true,
  autoplay = true,
  ariaLabel = "Motion graphic",
}: LottieAssetProps) {
  const playerRef = useRef<HTMLElement | null>(null);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setFailed(false);
    setReady(false);

    const player = playerRef.current;
    if (!player) return;

    const markReady = () => setReady(true);
    const markFailed = () => setFailed(true);

    player.addEventListener("ready", markReady);
    player.addEventListener("load", markReady);
    player.addEventListener("error", markFailed);

    const timeout = window.setTimeout(() => {
      if (!customElements.get("lottie-player")) {
        setFailed(true);
      }
    }, 7000);

    return () => {
      window.clearTimeout(timeout);
      player.removeEventListener("ready", markReady);
      player.removeEventListener("load", markReady);
      player.removeEventListener("error", markFailed);
    };
  }, [src]);

  return (
    <div className={`relative h-full w-full ${className}`}>
      <Script
        id="lottiefiles-player"
        type="module"
        src="https://unpkg.com/@lottiefiles/lottie-player@latest/dist/lottie-player.js"
        strategy="afterInteractive"
        onError={() => setFailed(true)}
      />

      {!ready ? (
        <div
          className="absolute inset-0 grid place-items-center"
          aria-hidden="true"
        >
          <div className="relative h-44 w-44 sm:h-56 sm:w-56">
            <div className="absolute inset-0 animate-pulse rounded-full bg-primary/10 blur-2xl" />
            <div className="absolute inset-[14%] rounded-full border border-cyan-200/20" />
            <div className="absolute inset-[28%] rounded-full border border-cyan-200/25" />
            <div className="absolute inset-[40%] grid place-items-center rounded-full bg-primary/20 text-xs font-black text-cyan-100">
              {failed ? "DRVO" : "LOADING"}
            </div>
          </div>
        </div>
      ) : null}

      {!failed
        ? createElement("lottie-player", {
            ref: playerRef,
            src,
            background: "transparent",
            speed: String(speed),
            loop: loop ? "" : undefined,
            autoplay: autoplay ? "" : undefined,
            "aria-label": ariaLabel,
            class: `h-full w-full transition-opacity duration-500 ${
              ready ? "opacity-100" : "opacity-0"
            }`,
            style: { width: "100%", height: "100%" },
          })
        : null}
    </div>
  );
}
