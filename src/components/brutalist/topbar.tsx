"use client";

import { SidebarTrigger } from "@/components/ui/sidebar";

// Mobile-only chrome: the sidebar uses the offcanvas Sheet pattern
// at <md, so it needs a hamburger somewhere on the page to open it.
// Desktop owns its own collapse + theme controls inside the sidebar
// footer (see brutalist-app-sidebar.tsx) — at md:+ this entire
// element disappears.
export function BrutalistTopbar() {
  return (
    <div
      className="oh-topbar oh-reveal md:hidden"
      style={{ ["--d" as string]: "0ms" }}
    >
      <div className="flex items-center gap-4">
        <SidebarTrigger className="rounded-(--oh-r-xs) size-9 border border-oh-ink text-oh-ink transition-colors duration-150 ease-bru hover:bg-oh-ink hover:text-oh-paper" />
      </div>
    </div>
  );
}
