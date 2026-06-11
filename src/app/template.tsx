"use client";

/**
 * Route template — Next.js re-mounts this on every navigation (unlike layout,
 * which persists). Wrapping the page in `animate-page-in` gives a smooth, quick
 * fade as the user moves between Saved / Compare / Inventory / chat, instead of
 * a hard snap. The animation is disabled under prefers-reduced-motion (see
 * globals.css).
 */
export default function Template({ children }: { children: React.ReactNode }) {
  // Must fill the parent's height and stay a flex column: the app shell relies
  // on an unbroken `flex-1 / min-h-0` chain so the chat's internal scroll area
  // and its pinned bottom input bar size correctly. A plain <div> here collapses
  // to content height, which pushed the input bar (and the disclosure line under
  // it) below the viewport. These classes keep the wrapper transparent to layout.
  return (
    <div className="animate-page-in flex min-h-0 min-w-0 flex-1 flex-col">
      {children}
    </div>
  );
}
