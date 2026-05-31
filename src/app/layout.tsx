import type { Metadata, Viewport } from "next";
import { DM_Sans, Fraunces, Outfit } from "next/font/google";
import "./globals.css";
import { APP_NAME, APP_DESCRIPTION, APP_TAGLINE } from "@/lib/constants";
import {
  BRAND_ICON_32_URL,
  BRAND_ICON_180_URL,
  BRAND_OG_MARK_URL,
  brandAssetUrl,
} from "@/lib/brand/mark-config";
import { getSiteUrl } from "@/lib/site";
import { AuthProvider } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/components/ThemeProvider";

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
});

const fraunces = Fraunces({
  variable: "--font-homy",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

/** Tab icons — generated from public/brand/mark.svg (see mark-config.ts). */
const TAB_ICON = brandAssetUrl(BRAND_ICON_32_URL);
const APPLE_ICON = brandAssetUrl(BRAND_ICON_180_URL);

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  icons: {
    icon: [{ url: TAB_ICON, type: "image/png", sizes: "32x32" }],
    apple: [{ url: APPLE_ICON, sizes: "180x180", type: "image/png" }],
  },
  title: {
    default: `${APP_NAME} — Compare Prices Across Every Store`,
    template: `%s · ${APP_NAME}`,
  },
  description: APP_DESCRIPTION,
  keywords: [
    "price comparison",
    "compare prices online",
    "cheapest shoes",
    "clothing deals",
    "grocery prices",
    "Walmart vs Target",
    "Nike deals",
    "home goods prices",
  ],
  openGraph: {
    title: APP_NAME,
    description: APP_TAGLINE,
    type: "website",
    locale: "en_US",
    images: [
      {
        url: brandAssetUrl(BRAND_OG_MARK_URL),
        width: 512,
        height: 512,
        alt: APP_NAME,
      },
    ],
  },
  twitter: {
    card: "summary",
    title: APP_NAME,
    description: APP_TAGLINE,
    images: ["/brand/og-mark.png"],
  },
};

export const viewport: Viewport = {
  themeColor: "#ea580c",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${dmSans.variable} ${outfit.variable} ${fraunces.variable} h-full`}
    >
      <head>
        <meta
          name="impact-site-verification"
          value="9624ca76-4d4b-48b7-aa75-b993343f25db"
        />
      </head>
      <body className="min-h-full antialiased">
        <ThemeProvider>
          <AuthProvider>{children}</AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
