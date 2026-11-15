import Image from "next/image";

import { APP_NAME } from "@/constants/app";
import { cn } from "@/lib/utils/cn";

const LOGOS = {
  // Bundled originals remain our no-DB / no-upload fallbacks.
  light: { fallback: "/brand/logo-on-light.png", src: "/api/brand/assets/primary-light", width: 790, height: 129 },
  dark: { fallback: "/brand/logo-on-dark.png", src: "/api/brand/assets/primary-dark", width: 779, height: 126 },
} as const;

type Surface = keyof typeof LOGOS;

function LogoImage({
  surface,
  className,
  priority,
  navigation,
}: {
  surface: Surface;
  className?: string;
  priority: boolean;
  navigation: boolean;
}) {
  const logo = LOGOS[surface];
  return (
    <Image
      src={navigation ? `/api/brand/assets/navigation?surface=${surface}` : logo.src}
      unoptimized
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
  navigation = false,
}: {
  surface?: Surface | "auto";
  className?: string;
  priority?: boolean;
  /** Keep the dashboard navigation logo independent from general brand logos. */
  navigation?: boolean;
}) {
  if (surface !== "auto") {
    return <LogoImage surface={surface} className={className} priority={priority} navigation={navigation} />;
  }
  return (
    <>
      <LogoImage surface="light" className={cn(className, "dark:hidden")} priority={priority} navigation={navigation} />
      <LogoImage surface="dark" className={cn(className, "hidden dark:block")} priority={priority} navigation={navigation} />
    </>
  );
}
