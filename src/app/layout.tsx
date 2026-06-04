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
import { AppChrome } from "@/components/AppChrome";

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
  icons: {
    icon: [
      { url: "/brand/mark-32.png", sizes: "32x32", type: "image/png" },
      { url: "/brand/mark-16.png", sizes: "16x16", type: "image/png" },
      { url: "/brand/mark.ico", rel: "shortcut icon" },
    ],
    apple: { url: "/brand/mark-180.png", sizes: "180x180", type: "image/png" },
  },
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

/** Allow dynamic child routes (inventory, chat) without forcing static shell. */
export const dynamic = "auto";

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
          <AuthProvider>
            <AppChrome>{children}</AppChrome>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
