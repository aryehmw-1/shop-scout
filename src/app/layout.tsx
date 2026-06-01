import type { Metadata, Viewport } from "next";
import { DM_Sans, Fraunces, Outfit } from "next/font/google";
import "./globals.css";
import { APP_NAME, APP_DESCRIPTION, APP_TAGLINE } from "@/lib/constants";
import { getSiteUrl } from "@/lib/site";
import {
  IMPACT_SITE_VERIFICATION_ID,
  IMPACT_VERIFICATION_METADATA_OTHER,
} from "@/lib/affiliate/impact-verification";
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

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
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
    "Amazon vs Costco",
    "Nike deals",
    "home goods prices",
  ],
  openGraph: {
    title: APP_NAME,
    description: APP_TAGLINE,
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: APP_NAME,
    description: APP_TAGLINE,
  },
  /** SSR head meta — paired with htmlLimitedBots so crawlers see it in initial HTML. */
  other: {
    ...IMPACT_VERIFICATION_METADATA_OTHER,
  },
};

export const viewport: Viewport = {
  themeColor: "#ea580c",
  width: "device-width",
  initialScale: 1,
};

/** Keep homepage metadata in prerendered HTML (crawler-visible without streaming). */
export const dynamic = "force-static";

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
        {/* Crawler-visible verification — metadata.other may stream outside initial head. */}
        <meta
          name="impact-site-verification"
          content={IMPACT_SITE_VERIFICATION_ID}
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
