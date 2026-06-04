import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Pin Turbopack root to this app directory (where package-lock + node_modules/next live).
 * Using process.cwd() here caused "Next.js package not found" + endless HMR restart loops
 * when the dev server was started from a different working directory.
 */
const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const ignoredDevWatchPaths = [
  "**/.git/**",
  "**/.next/**",
  "**/node_modules/**",
  "**/artifacts/**",
  "**/data/**",
  "**/prisma/data/**",
];

const nextConfig: NextConfig = {
  serverExternalPackages: ["paapi5-nodejs-sdk"],
  // Prevent NFT (output file tracing) from bundling large local directories.
  // artifacts/ = 312 MB of scraping debug files; data/ = chunked product JSON.
  // These paths are only used in dev/scripts — never at Vercel runtime.
  outputFileTracingExcludes: {
    "*": [
      "./artifacts/**",
      "./data/**",
      "./prisma/data/**",
      "./prisma/migrations/**",
      "./.git/**",
    ],
  },
  /** Emit metadata tags in initial HTML for all UAs (curl, Impact crawler, browsers). */
  htmlLimitedBots: /.*/,
  /** Removes the black floating Next.js dev indicator (lower-left in dev). */
  devIndicators: false,
  async redirects() {
    return [
      { source: "/demo", destination: "/inventory", permanent: true },
      { source: "/demo/status", destination: "/inventory/status", permanent: true },
      {
        source: "/demo/products/:id",
        destination: "/inventory/products/:id",
        permanent: true,
      },
      { source: "/verified", destination: "/inventory", permanent: true },
    ];
  },
  turbopack: {
    root: projectRoot,
  },
  webpack: (config, { dev }) => {
    if (dev) {
      config.watchOptions = {
        ...(config.watchOptions ?? {}),
        ignored: ignoredDevWatchPaths,
      };
    }
    return config;
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
