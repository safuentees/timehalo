"use client";

import { SidebarTrigger } from "@/components/ui/sidebar";

export function BrutalistTopbar() {
  return (
    <div
      className="bru-topbar bru-reveal md:hidden"
      style={{ ["--d" as string]: "0ms" }}
    >
      <div className="flex items-center gap-4">
        <SidebarTrigger className="rounded-(--bru-r-xs) size-9 border border-bru-ink text-bru-ink transition-colors duration-150 ease-bru hover:bg-bru-ink hover:text-bru-paper" />
      </div>
    </div>
  );
}
