import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Pin Turbopack root to this app directory (where package-lock + node_modules/next live).
 * Using process.cwd() here caused "Next.js package not found" + endless HMR restart loops
 * when the dev server was started from a different working directory.
 */
const projectRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  serverExternalPackages: ["paapi5-nodejs-sdk"],
  /** Emit metadata tags in initial HTML for all UAs (curl, Impact crawler, browsers). */
  htmlLimitedBots: /.*/,
  /** Removes the black floating Next.js dev indicator (lower-left in dev). */
  devIndicators: false,
  turbopack: {
    root: projectRoot,
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "placehold.co",
        pathname: "/**",
      },
    ],
  },
};

export default nextConfig;
