"use client";

import { useMemo } from "react";
import { CalendarIcon, Clock3Icon } from "lucide-react";
import { trpc } from "@/trpc/hooks";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";

type Props = { handle: string };

export default function HostProfile({ handle }: Props) {
  const { data: user } = trpc.users.getByHandle.useQuery({ handle });
  const { data: slots = [] } = trpc.schedule.getUpcomingSlots.useQuery({
    handle,
  });

  const grouped = useMemo(() => groupByDay(slots), [slots]);

  if (!user) return null;

  const displayName = user.name ?? user.handle ?? "Host";
  const initials = toInitials(displayName);

  return (
    <main className="bru-main" id="top">
      <div className="bru-topbar">
        <div className="flex items-center gap-3">
          <div className="bru-monogram">OH</div>
          <div>
            <div className="bru-topbar-title">
              OFFICE HOURS · /h/{user.handle}
            </div>
            <div className="bru-topbar-sub">
              PUBLIC PROFILE · BOOK A 15-MIN SLOT
            </div>
          </div>
        </div>
      </div>

      <section className="bru-profile-hero">
        <div className="bru-profile-hero-inner">
          <Avatar size="lg" className="bru-profile-avatar">
            <AvatarImage
              src={user.image ?? undefined}
              alt={displayName}
              className="rounded-none"
            />
            <AvatarFallback className="rounded-none bg-(--bru-paper) text-(color:--bru-ink) font-[family-name:var(--bru-mono)] text-[18px] font-extrabold tracking-[2px]">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="bru-profile-meta">
            <div className="bru-profile-kicker">OFFICE HOURS</div>
            <h1 className="bru-profile-name">{displayName}</h1>
            <p className="bru-profile-bio">
              Book a short conversation — writing, software, or whatever&apos;s
              been rattling around your head lately.
            </p>
            <div className="bru-profile-badges">
              <Badge variant="outline" className="bru-profile-badge">
                <Clock3Icon data-icon="inline-start" />
                15 min
              </Badge>
              <Badge variant="outline" className="bru-profile-badge">
                {slots.length} SLOTS · 7 DAYS
              </Badge>
            </div>
          </div>
        </div>
      </section>

      <section className="bru-profile-section">
        <div className="bru-profile-section-head">
          <span className="bru-profile-section-kicker">
            UPCOMING · NEXT 7 DAYS
          </span>
          <span className="bru-profile-section-count">
            {slots.length.toString().padStart(2, "0")} SLOTS
          </span>
        </div>

        {slots.length === 0 ? (
          <HostEmpty displayName={displayName} />
        ) : (
          <div className="bru-profile-days">
            {grouped.map((group) => (
              <DayBlock key={group.key} group={group} />
            ))}
          </div>
        )}
      </section>

      <div className="bru-endrule">
        <span>— END · PICK A SLOT ABOVE —</span>
        <span>/h/{user.handle}</span>
      </div>
    </main>
  );
}

function HostEmpty({ displayName }: { displayName: string }) {
  return (
    <div className="bru-profile-empty">
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <CalendarIcon />
          </EmptyMedia>
          <EmptyTitle>No slots this week</EmptyTitle>
          <EmptyDescription>
            {displayName} hasn&apos;t opened any time yet. Check back later.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    </div>
  );
}

function DayBlock({ group }: { group: DayGroup }) {
  return (
    <div className="bru-profile-day">
      <div className="bru-profile-day-head">
        <span className="bru-profile-day-label">{group.label}</span>
        <span className="bru-profile-day-count">
          {group.slots.length} SLOTS
        </span>
      </div>
      <ItemGroup className="bru-profile-slots">
        {group.slots.map((s) => (
          <SlotRow key={s.start} start={s.start} end={s.end} />
        ))}
      </ItemGroup>
    </div>
  );
}

function SlotRow({ start, end }: { start: string; end: string }) {
  const startDate = new Date(start);
  const endDate = new Date(end);
  const time = `${fmtTime(startDate)} — ${fmtTime(endDate)}`;
  const relative = fmtRelative(startDate);

  return (
    <Item variant="outline" className="bru-slot-item">
      <ItemMedia className="bru-slot-media">
        <Clock3Icon />
      </ItemMedia>
      <ItemContent>
        <ItemTitle className="bru-slot-time">{time}</ItemTitle>
        <ItemDescription className="bru-slot-desc">
          15-min conversation · {relative}
        </ItemDescription>
      </ItemContent>
      <ItemActions>
        <Button variant="brutalist" size="brutalist">
          BOOK →
        </Button>
      </ItemActions>
    </Item>
  );
}

type DayGroup = {
  key: string;
  label: string;
  slots: { start: string; end: string }[];
};

function groupByDay(slots: { start: string; end: string }[]): DayGroup[] {
  const map = new Map<string, DayGroup>();
  for (const slot of slots) {
    const d = new Date(slot.start);
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    const existing = map.get(key);
    if (existing) {
      existing.slots.push(slot);
    } else {
      map.set(key, { key, label: fmtDayLabel(d), slots: [slot] });
    }
  }
  return Array.from(map.values());
}

function fmtDayLabel(d: Date): string {
  const weekday = d
    .toLocaleDateString(undefined, { weekday: "long" })
    .toUpperCase();
  const month = d
    .toLocaleDateString(undefined, { month: "short" })
    .toUpperCase();
  const day = d.getDate();
  return `${weekday} · ${month} ${day}`;
}

function fmtTime(d: Date): string {
  return d.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function fmtRelative(d: Date): string {
  const now = new Date();
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  );
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round(
    (target.getTime() - startOfToday.getTime()) / 86_400_000,
  );
  if (diffDays === 0) return "today";
  if (diffDays === 1) return "tomorrow";
  return `in ${diffDays} days`;
}

function toInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((s) => s[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}
