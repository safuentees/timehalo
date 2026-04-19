"use client";

import { Sun, Moon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useBrutalistPrefs } from "./prefs-context";

type Props = {
  onNewPost: () => void;
};

export function BrutalistTopbar({ onNewPost }: Props) {
  const { theme, isDark, toggleTheme } = useBrutalistPrefs();

  return (
    <div className="bru-topbar bru-reveal" style={{ ["--d" as string]: "0ms" }}>
      <div className="flex items-center gap-4">
        <SidebarTrigger className="rounded-none size-9 text-[var(--bru-ink)] border border-[var(--bru-ink)] hover:bg-[var(--bru-ink)] hover:text-[var(--bru-paper)] transition-colors duration-[80ms] [transition-timing-function:steps(1)]" />
        <div>
          <div className="bru-topbar-title">WRITING / 2026 / APRIL</div>
          <div className="bru-topbar-sub">A LEARNING JOURNAL · v0.4.2</div>
        </div>
      </div>
      <div className="bru-topbar-right">
        <Button
          variant="brutalistGhost"
          size="brutalist"
          onClick={toggleTheme}
          aria-label="Toggle theme"
          suppressHydrationWarning
        >
          {theme === undefined ? (
            <span className="w-[60px]" aria-hidden />
          ) : isDark ? (
            <>
              <Sun className="size-3" />
              LIGHT
            </>
          ) : (
            <>
              <Moon className="size-3" />
              DARK
            </>
          )}
        </Button>
        <Button variant="brutalist" size="brutalist" onClick={onNewPost}>
          + NEW POST
        </Button>
      </div>
    </div>
  );
}
