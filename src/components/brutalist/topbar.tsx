"use client";

import { useEffect, useState } from "react";
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
  const pathname = usePathname();
  const { theme, isDark, toggleTheme } = useBrutalistPrefs();
  const { openNewPost } = useNewPost();

  // Hold pathname-derived conditionals until after mount. Next.js 16 can
  // prerender a static shell where `usePathname()` doesn't match the
  // client value, which makes the conditional `+ NEW POST` button exist
  // on the client but not on the server. React then fails hydration on
  // this subtree, which silently drops every button's event handler.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const activePath = mounted ? pathname : null;

  const { title, sub } = resolveTitle(activePath);
  const showNewPost = activePath === "/";

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
          aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
          className="rounded-(--bru-r-xs)"
          suppressHydrationWarning
        >
          {theme === undefined ? (
            <span aria-hidden />
          ) : isDark ? (
            <Sun />
          ) : (
            <Moon />
          )}
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
