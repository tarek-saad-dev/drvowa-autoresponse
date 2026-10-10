import Image from "next/image";

import { APP_NAME } from "@/constants/app";
import { cn } from "@/lib/utils/cn";

const LOGOS = {
  light: { src: "/brand/logo-on-light.png", width: 790, height: 129 },
  dark: { src: "/brand/logo-on-dark.png", width: 779, height: 126 },
} as const;

type Surface = keyof typeof LOGOS;

function LogoImage({
  surface,
  className,
  priority,
}: {
  surface: Surface;
  className?: string;
  priority: boolean;
}) {
  const logo = LOGOS[surface];
  return (
    <Image
      src={logo.src}
      width={logo.width}
      height={logo.height}
      alt={APP_NAME}
      priority={priority}
      className={cn("h-8 w-auto", className)}
    />
  );
}

/**
 * `auto` follows the active theme; `light` / `dark` pin the variant for
 * surfaces that keep the same background in both themes (e.g. the sidebar).
 */
export function BrandLogo({
  surface = "auto",
  className,
  priority = false,
}: {
  surface?: Surface | "auto";
  className?: string;
  priority?: boolean;
}) {
  if (surface !== "auto") {
    return <LogoImage surface={surface} className={className} priority={priority} />;
  }
  return (
    <>
      <LogoImage surface="light" className={cn(className, "dark:hidden")} priority={priority} />
      <LogoImage surface="dark" className={cn(className, "hidden dark:block")} priority={priority} />
    </>
  );
}
