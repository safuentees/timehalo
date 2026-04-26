"use client";

import { Sun, Moon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useBrutalistPrefs } from "./prefs-context";

// App chrome topbar — sidebar trigger on the left, theme toggle on the
// right. No route titles, no subtitles: the sidebar establishes route
// context, the page's own h1 owns the heading. Apple HIG: don't repeat
// what surrounding chrome already says.
export function BrutalistTopbar() {
  const { toggleTheme } = useBrutalistPrefs();

  return (
    <div className="bru-topbar bru-app-topbar bru-reveal" style={{ ["--d" as string]: "0ms" }}>
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
          {/*
            Render BOTH glyphs; CSS hides the wrong one based on the
            `.dark` class next-themes sets synchronously on <html>
            before paint. No JS check, no `mounted` gate, no flash.
          */}
          <Sun className="dark:hidden" />
          <Moon className="hidden dark:block" />
        </Button>
      </div>
    </div>
  );
}
