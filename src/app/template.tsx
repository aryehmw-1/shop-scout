"use client";

/**
 * Route template — Next.js re-mounts this on every navigation (unlike layout,
 * which persists). Wrapping the page in `animate-page-in` gives a smooth, quick
 * fade as the user moves between Saved / Compare / Inventory / chat, instead of
 * a hard snap. The animation is disabled under prefers-reduced-motion (see
 * globals.css).
 */
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="animate-page-in">{children}</div>;
}
