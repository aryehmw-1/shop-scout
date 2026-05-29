import type { Metadata, Viewport } from "next";
import { DM_Sans, Fraunces, Outfit } from "next/font/google";
import "./globals.css";
import { APP_NAME, APP_DESCRIPTION, APP_TAGLINE } from "@/lib/constants";
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

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  /** Favicon + apple touch: `src/app/icon.svg` and `src/app/apple-icon.svg` (no duplicate metadata.icons). */
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
  },
  twitter: {
    card: "summary_large_image",
    title: APP_NAME,
    description: APP_TAGLINE,
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
      <body className="min-h-full antialiased">
        <ThemeProvider>
          <AuthProvider>{children}</AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
