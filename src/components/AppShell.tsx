import { Sidebar } from "./Sidebar";
import { MobileNav } from "./MobileNav";

export function AppShell({
  children,
  scroll = "page",
}: {
  children: React.ReactNode;
  /** "none" = child controls scroll (chat with pinned input). Default = page scrolls. */
  scroll?: "page" | "none";
}) {
  return (
    <div className="app-mesh flex h-[100dvh] overflow-hidden">
      <Sidebar />
      <div
        className={`flex min-h-0 min-w-0 flex-1 flex-col pt-14 lg:pt-0 ${
          scroll === "page" ? "overflow-y-auto" : "overflow-hidden"
        }`}
      >
        {children}
      </div>
      <MobileNav />
    </div>
  );
}
