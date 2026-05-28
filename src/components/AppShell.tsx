import { Sidebar } from "./Sidebar";
import { MobileNav } from "./MobileNav";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-mesh flex min-h-[100dvh]">
      <Sidebar />
      <div className="flex min-h-[100dvh] min-w-0 flex-1 flex-col overflow-y-auto pb-20 md:pb-0">
        {children}
      </div>
      <MobileNav />
    </div>
  );
}
