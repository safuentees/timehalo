"use client";

import { Sun, Moon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useBrutalistPrefs } from "./prefs-context";

export function BrutalistTopbar() {
  const { toggleTheme } = useBrutalistPrefs();

  return (
    <div className="bru-topbar bru-reveal" style={{ ["--d" as string]: "0ms" }}>
      <div className="flex items-center gap-4">
        <SidebarTrigger className="rounded-(--bru-r-xs) size-9 text-[var(--bru-ink)] border border-[var(--bru-ink)] hover:bg-[var(--bru-ink)] hover:text-[var(--bru-paper)] transition-colors duration-150 ease-bru" />
      </div>
      <div className="bru-topbar-right">
        <Button
          variant="brutalistGhost"
          size="brutalistIcon"
          onClick={toggleTheme}
          aria-label="Toggle theme"
          className="rounded-(--bru-r-xs)"
        >
          <Sun className="dark:hidden" />
          <Moon className="hidden dark:block" />
        </Button>
      </div>
    </div>
  );
}
