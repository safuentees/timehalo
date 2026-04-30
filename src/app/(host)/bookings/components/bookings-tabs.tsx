"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import type { Tab } from "./bookings-list";

const VALID_TABS = ["upcoming", "past"] as const;

export function BookingsTabs({
  activeTab,
  upcomingCount,
  pastCount,
}: {
  activeTab: Tab;
  upcomingCount?: number;
  pastCount?: number;
}) {
  const t = useTranslations("Bookings");
  const router = useRouter();

  return (
    <Tabs
      value={activeTab}
      onValueChange={(value) => {
        if (value === activeTab) return;
        if (!VALID_TABS.includes(value as Tab)) return;
        router.push(`?tab=${value}`, { scroll: false });
      }}
      className="mt-8"
    >
      <TabsList
        aria-label={t("tablistLabel")}
        className="h-auto w-fit gap-0 overflow-hidden rounded-(--oh-r-sm) border-2 border-oh-line-strong bg-transparent p-0"
      >
        <BookingsTabTrigger value="upcoming" count={upcomingCount}>
          {t("tabUpcoming")}
        </BookingsTabTrigger>
        <BookingsTabTrigger value="past" count={pastCount}>
          {t("tabPast")}
        </BookingsTabTrigger>
      </TabsList>
    </Tabs>
  );
}

function BookingsTabTrigger({
  value,
  count,
  children,
}: {
  value: Tab;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <TabsTrigger
      value={value}
      className={[
        "h-auto flex-none rounded-none border-0 px-4 py-2.5",
        "font-[family-name:var(--oh-mono)] text-[11px] font-extrabold tracking-[2px] uppercase",
        "border-r-2 border-oh-line-strong last:border-r-0",
        "data-active:!bg-oh-content data-active:!text-oh-bg data-active:!shadow-none",
        "hover:bg-oh-tint",
      ].join(" ")}
    >
      <span className="leading-none">{children}</span>
      {typeof count === "number" ? (
        <span className="tabular-nums text-[11px] font-bold leading-none opacity-45 group-data-[state=active]:opacity-65 data-active:opacity-65">
          {count}
        </span>
      ) : null}
    </TabsTrigger>
  );
}
