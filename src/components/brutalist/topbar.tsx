"use client";

import { usePathname } from "next/navigation";
import { Sun, Moon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useBrutalistPrefs } from "./prefs-context";
import { useNewPost } from "./new-post-context";

type TitleInfo = { title: string; sub: string };

const TITLE_MAP: Record<string, TitleInfo> = {
  "/": { title: "WRITING / 2026 / APRIL", sub: "A LEARNING JOURNAL · v0.4.2" },
  "/drafts": { title: "DRAFTS / LIBRARY", sub: "UNFINISHED THOUGHTS · PENDING" },
  "/archive": { title: "ARCHIVE / LIBRARY", sub: "OLDER · STILL READABLE" },
  "/tags": { title: "TAGS / LIBRARY", sub: "CROSS-CUTTING CONCERNS" },
  "/analytics": {
    title: "ANALYTICS / WORKSPACE",
    sub: "READS · TIME · DROP-OFF",
  },
  "/settings": {
    title: "SETTINGS / WORKSPACE",
    sub: "PREFERENCES · ACCOUNT",
  },
  "/lab/halftone": { title: "HALFTONE / LAB", sub: "WEBGL WALKTHROUGH" },
};

function resolveTitle(pathname: string | null): TitleInfo {
  if (pathname && TITLE_MAP[pathname]) return TITLE_MAP[pathname];
  return TITLE_MAP["/"];
}

export function BrutalistTopbar() {
  // usePathname() returns the correct value at SSR AND on the client,
  // so the conditional `+ NEW POST` button is server-rendered when the
  // user lands on `/`. The earlier `mounted` gate was a defensive
  // workaround for Next 16's static-shell prerender + rewrites quirk;
  // we don't have rewrites (`proxy.ts` only redirects), and we pin to
  // 16.1.7 which fixed the static-shell race. Skipping the gate means
  // the button doesn't get unmounted/remounted across SSR→hydrate.
  const pathname = usePathname();
  const { toggleTheme } = useBrutalistPrefs();
  const { openNewPost } = useNewPost();

  const { title, sub } = resolveTitle(pathname);
  const showNewPost = pathname === "/";

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
            (next-themes docs: "CSS-Based Theme Switching".)
          */}
          <Sun className="dark:hidden" />
          <Moon className="hidden dark:block" />
        </Button>
        {showNewPost ? (
          <Button
            variant="brutalist"
            size="brutalist"
            onClick={openNewPost}
          >
            + NEW POST
          </Button>
        ) : null}
      </div>
    </div>
  );
}
