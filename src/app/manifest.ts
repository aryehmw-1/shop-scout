import type { MetadataRoute } from "next";
import { APP_DESCRIPTION, APP_NAME, APP_TAGLINE } from "@/lib/constants";
import {
  BRAND_MARK_CANONICAL_URL,
  BRAND_ICON_32_URL,
  BRAND_ICON_180_URL,
} from "@/lib/brand/mark-config";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: APP_NAME,
    short_name: APP_NAME,
    description: APP_DESCRIPTION || APP_TAGLINE,
    start_url: "/",
    display: "standalone",
    background_color: "#faf6f0",
    theme_color: "#ea580c",
    icons: [
      {
        src: BRAND_ICON_180_URL,
        sizes: "180x180",
        type: "image/png",
        purpose: "any",
      },
      {
        src: BRAND_ICON_32_URL,
        sizes: "32x32",
        type: "image/png",
        purpose: "any",
      },
      {
        src: BRAND_MARK_CANONICAL_URL,
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}
