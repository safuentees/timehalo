"use client";

import { Sun, Moon } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = {
  onNewPost: () => void;
  theme: string | undefined;
  onThemeToggle: () => void;
};

export function BrutalistTopbar({ onNewPost, theme, onThemeToggle }: Props) {
  const isDark = theme === "dark";

  return (
    <div className="bru-topbar bru-reveal" style={{ ["--d" as string]: "0ms" }}>
      <div>
        <div className="bru-topbar-title">WRITING / 2026 / APRIL</div>
        <div className="bru-topbar-sub">A LEARNING JOURNAL · v0.4.2</div>
      </div>
      <div className="bru-topbar-right">
        <Button
          variant="brutalistGhost"
          size="brutalist"
          onClick={onThemeToggle}
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
