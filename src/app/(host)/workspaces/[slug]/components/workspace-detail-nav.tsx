"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowLeftIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// Shared sub-nav for the workspace detail surface — the row that
// sits between the page header and the first section. Renders on
// BOTH `/workspaces/[slug]/members` and `/workspaces/[slug]/settings`
// so the navigation is consistent + a single source of truth (no
// per-page drift, no debug classes left over from one but not the
// other, no different vertical rhythm pushing content around).
//
// Two-row layout:
//   1. Tertiary "Back to workspaces" link — small mono caps eyebrow
//      with a leading arrow. Same shape settings hub pages use to
//      escape back up the navigation tree.
//   2. Tab strip — Members | Settings, sibling pages of the
//      workspace detail. Active tab carries the project's depth-card
//      vocabulary (paper bg + drop shadow lift), inactive tabs read
//      as muted opacity-55 text. Same active-row chrome the sidebar
//      nav speaks (`bg-[color:var(--oh-paper)] shadow-resting`).
//
// Replaces:
//   - `members-panel.tsx` — a flex-justify-between strip with `Back
//     to list ←` and `Workspace settings →` (also had a debug
//     `bg-amber-50` class).
//   - `settings-panel.tsx` — a single-link `Back to members ←` with
//     no forward affordance + different vertical rhythm.
//
// Why a tab strip instead of paired arrow links: the two pages are
// SIBLINGS of the same parent (the workspace), not a linear flow
// with a forward direction. Tabs communicate "pick which surface
// you want" instead of "next page after this one." Matches the
// pattern at the top of `/settings/general` etc. (subnav).

type Active = "members" | "settings";

const TABS: ReadonlyArray<Active> = ["members", "settings"];

export function WorkspaceDetailNav({
  slug,
  active,
}: {
  slug: string;
  active: Active;
}) {
  const t = useTranslations("Workspaces");

  return (
    <div className="mt-4 flex flex-col gap-3">
      <Link
        href="/workspaces"
        className="oh-eyebrow inline-flex w-fit items-center gap-1.5 transition-opacity duration-150 ease-oh hover:opacity-100"
      >
        <ArrowLeftIcon className="size-3" aria-hidden />
        {t("backToList")}
      </Link>

      <nav role="tablist" className="flex gap-1" aria-label={t("title")}>
        {TABS.map((tab) => {
          const isActive = active === tab;
          return (
            <Link
              key={tab}
              href={`/workspaces/${slug}/${tab}`}
              role="tab"
              aria-selected={isActive}
              className={cn(
                "rounded-(--oh-r-xs) px-3 py-1.5 text-[13px] font-medium transition-[background-color,color,box-shadow,opacity] duration-150 ease-oh",
                isActive
                  ? "bg-[color:var(--oh-paper)] font-bold shadow-[var(--oh-shadow-resting)]"
                  : "opacity-55 hover:bg-[var(--oh-tint)] hover:opacity-100",
              )}
            >
              {t(`detailTab_${tab}`)}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
