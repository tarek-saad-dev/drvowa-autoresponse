"use client";

import Script from "next/script";
import { createElement } from "react";

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
  return (
    <>
      <Script
        id="lottiefiles-player"
        type="module"
        src="https://unpkg.com/@lottiefiles/lottie-player@latest/dist/lottie-player.js"
        strategy="afterInteractive"
      />
      {createElement("lottie-player", {
        src,
        background: "transparent",
        speed: String(speed),
        loop: loop ? "" : undefined,
        autoplay: autoplay ? "" : undefined,
        "aria-label": ariaLabel,
        class: className,
        style: { width: "100%", height: "100%" },
      })}
    </>
  );
}
