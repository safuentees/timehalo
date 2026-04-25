"use client";

import { usePathname } from "next/navigation";
import { Sun, Moon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useBrutalistPrefs } from "./prefs-context";

type TitleInfo = { title: string; sub: string };

const TITLE_MAP: Record<string, TitleInfo> = {
  "/bookings": { title: "BOOKINGS / HOST", sub: "PENDING · CONFIRMED · PAST" },
  "/availability": {
    title: "AVAILABILITY / HOST",
    sub: "WEEKLY WINDOWS · OVERRIDES",
  },
  "/profile": { title: "PROFILE / HOST", sub: "HANDLE · BIO · FAQ" },
  "/settings": {
    title: "SETTINGS / HOST",
    sub: "ACCOUNT · TIMEZONE · DANGER",
  },
};

function resolveTitle(pathname: string | null): TitleInfo {
  if (pathname && TITLE_MAP[pathname]) return TITLE_MAP[pathname];
  // Default brand stripe — covers `/`, login redirects, anything unknown.
  return { title: "OFFICEHOURS / HOST", sub: "ONE BOOKING AT A TIME" };
}

export function BrutalistTopbar() {
  const pathname = usePathname();
  const { toggleTheme } = useBrutalistPrefs();
  const { title, sub } = resolveTitle(pathname);

  return (
    <div className="bru-topbar bru-reveal" style={{ ["--d" as string]: "0ms" }}>
      <div className="flex items-center gap-4">
        <SidebarTrigger className="rounded-(--bru-r-xs) size-9 text-[var(--bru-ink)] border border-[var(--bru-ink)] hover:bg-[var(--bru-ink)] hover:text-[var(--bru-paper)] transition-colors duration-150 ease-bru" />
        <div>
          <div className="bru-topbar-title">{title}</div>
          <div className="bru-topbar-sub">{sub}</div>
        </div>
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
