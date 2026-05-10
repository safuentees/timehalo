"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowLeftIcon } from "lucide-react";
import { cn } from "@/lib/utils";

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
