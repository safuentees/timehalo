"use client";

import { SidebarTrigger } from "@/components/ui/sidebar";

export function OhTopbar() {
  return (
    <div
      className="oh-topbar oh-reveal md:hidden"
      style={{ ["--d" as string]: "0ms" }}
    >
      <div className="flex items-center gap-4">
        <SidebarTrigger className="rounded-(--oh-r-xs) size-9 border border-oh-ink text-oh-ink transition-colors duration-150 ease-oh hover:bg-oh-ink hover:text-oh-paper" />
      </div>
    </div>
  );
}
