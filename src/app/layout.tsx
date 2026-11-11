import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans_Arabic, Space_Grotesk } from "next/font/google";
import type { ReactNode } from "react";

import { APP_TAGLINE } from "@/constants/app";
import { appConfig } from "@/lib/config/app";

import "./globals.css";

const ibmPlexArabic = IBM_Plex_Sans_Arabic({
  variable: "--font-ibm-plex-arabic",
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const siteUrl = process.env.APP_BASE_URL?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim();

export const metadata: Metadata = {
  ...(siteUrl ? { metadataBase: new URL(siteUrl) } : {}),
  title: {
    default: `${appConfig.name} — ${APP_TAGLINE}`,
    template: `%s | ${appConfig.name}`,
  },
  description: appConfig.description,
  applicationName: appConfig.name,
  // Uploaded app icon is served from durable Brand Assets; fallback is the bundled favicon.
  icons: { icon: [{ url: "/api/brand/assets/icon" }] },
  openGraph: {
    type: "website",
    siteName: appConfig.name,
    title: `${appConfig.name} — ${APP_TAGLINE}`,
    description: appConfig.description,
    locale: "ar_EG",
    ...(siteUrl ? { url: siteUrl } : {}),
    images: [
      {
        url: "/og-image.jpg",
        width: 1024,
        height: 537,
        type: "image/jpeg",
        alt: `${appConfig.name} — ${APP_TAGLINE}`,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: `${appConfig.name} — ${APP_TAGLINE}`,
    description: appConfig.description,
    images: ["/og-image.jpg"],
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f9fc" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0f14" },
  ],
};

type RootLayoutProps = Readonly<{
  children: ReactNode;
}>;

const themeBootScript = `
  (() => {
    try {
      const saved = localStorage.getItem("drvo-theme");
      const theme =
        saved === "light" || saved === "dark"
          ? saved
          : window.matchMedia("(prefers-color-scheme: dark)").matches
            ? "dark"
            : "light";
      document.documentElement.dataset.theme = theme;
      document.documentElement.style.colorScheme = theme;
    } catch {
      document.documentElement.dataset.theme = "light";
    }
  })();
`;

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html
      lang="ar"
      dir="rtl"
      suppressHydrationWarning
      className={`${ibmPlexArabic.variable} ${spaceGrotesk.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body className="flex min-h-full flex-col font-sans">{children}</body>
    </html>
  );
}
