"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRightIcon, CalendarIcon, Clock3Icon } from "lucide-react";
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

type Props = { handle: string };

type Slot = { start: string; end: string };

/**
 * Public host profile. Reads two queries hydrated by the server:
 *   users.getByHandle           — identity (name, image)
 *   schedule.getUpcomingSlots   — next 7 days of 15-min slots
 *
 * NOT_FOUND on either query is handled by the page before render, so here
 * we assume the data is present.
 */
export default function HostProfile({ handle }: Props) {
  const { data: user } = trpc.users.getByHandle.useQuery({ handle });
  const { data: slots = [] } = trpc.schedule.getUpcomingSlots.useQuery({
    handle,
  });

  // All 7 upcoming days — including empty ones. The visitor needs to see
  // "Friday: closed" explicitly, not just a silently missing day.
  const weekDays = useMemo(() => buildWeekDays(slots), [slots]);
  const dayIds = useMemo(() => weekDays.map((d) => `day-${d.key}`), [weekDays]);
  const activeDayId = useScrollSpy(dayIds);
  const nextSlot = slots[0] as Slot | undefined;
  const visitorTz = useVisitorTz();
  useReadyClass();

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

      <section className="bru-profile-hero bru-reveal">
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
                15 MIN
              </Badge>
              <Badge variant="outline" className="bru-profile-badge">
                {slots.length.toString().padStart(2, "0")} SLOTS · 7 DAYS
              </Badge>
              <Badge variant="outline" className="bru-profile-badge">
                {visitorTz} · [TZ TBD]
              </Badge>
            </div>
          </div>
        </div>
      </section>

      <section className="bru-profile-section bru-profile-layout">
        {nextSlot ? (
          <aside className="bru-profile-rail">
            <NextAvailable slot={nextSlot} />
          </aside>
        ) : null}

        <WeekStrip days={weekDays} activeId={activeDayId} />

        <div className="bru-profile-main">
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
              {weekDays.map((day) => (
                <DayBlock key={day.key} day={day} />
              ))}
            </div>
          )}
        </div>
      </section>

      <div className="bru-endrule">
        <span>— END · PICK A SLOT ABOVE —</span>
        <span>/h/{user.handle}</span>
      </div>
    </main>
  );
}

// ——— Sub-components ———

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

function NextAvailable({ slot }: { slot: Slot }) {
  const startDate = new Date(slot.start);
  return (
    <section className="bru-next-available bru-reveal" aria-label="Next available slot">
      <span className="bru-next-available-kicker">NEXT AVAILABLE</span>
      <div className="bru-next-available-body">
        <span className="bru-next-available-time">{fmtTime(startDate)}</span>
        <span className="bru-next-available-meta">
          {fmtDayLabelShort(startDate)} · {fmtRelative(startDate)}
        </span>
      </div>
      <Button
        type="button"
        variant="brutalist"
        size="brutalist"
        className="bru-next-available-cta"
        onClick={() => scrollToDay(makeDayKey(startDate))}
      >
        BOOK NOW
        <ArrowRightIcon />
      </Button>
    </section>
  );
}

function WeekStrip({
  days,
  activeId,
}: {
  days: WeekDay[];
  activeId: string | null;
}) {
  return (
    <nav className="bru-week-strip" aria-label="Week overview">
      <span className="bru-week-strip-kicker">WEEK</span>
      <ol className="bru-week-strip-cells">
        {days.map((d) => {
          const id = `day-${d.key}`;
          const active = id === activeId;
          return (
            <li key={d.key}>
              <a
                href={`#${id}`}
                className="bru-week-cell"
                data-active={active ? "" : undefined}
                aria-label={`${d.weekdayLong} ${d.slots.length} slots`}
              >
                <span className="bru-week-cell-label">
                  <span className="bru-week-cell-letter">
                    {d.weekdayLetter}
                  </span>
                  <span className="bru-week-cell-count">
                    {d.slots.length.toString().padStart(2, "0")}
                  </span>
                </span>
                <span
                  className="bru-week-cell-density"
                  data-density={densityLevel(d.slots.length)}
                />
              </a>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function DayBlock({ day }: { day: WeekDay }) {
  const empty = day.slots.length === 0;
  const bands = useMemo(() => bucketByTimeOfDay(day.slots), [day.slots]);
  return (
    <div
      id={`day-${day.key}`}
      className={`bru-profile-day${empty ? " bru-profile-day-empty" : ""}`}
    >
      <div className="bru-profile-day-head">
        <span className="bru-profile-day-label">{day.label}</span>
        <span className="bru-profile-day-count">
          {empty ? "CLOSED" : `${day.slots.length} SLOTS`}
        </span>
      </div>
      {empty ? (
        <span className="bru-empty-row">closed ·</span>
      ) : (
        <div className="bru-time-bands">
          {bands.map((band) =>
            band.slots.length > 0 ? (
              <TimeBand key={band.id} band={band} />
            ) : null,
          )}
        </div>
      )}
    </div>
  );
}

function TimeBand({ band }: { band: Band }) {
  const [expanded, setExpanded] = useState(false);
  const collapseAt = 5;
  const collapsed = !expanded && band.slots.length > collapseAt;
  const visible = collapsed ? band.slots.slice(0, 4) : band.slots;
  const hidden = collapsed ? band.slots.length - visible.length : 0;

  return (
    <div className="bru-time-band">
      <span className="bru-kicker bru-time-band-kicker">{band.label}</span>
      <div className="bru-slot-chips">
        {visible.map((s) => (
          <SlotChip key={s.start} slot={s} />
        ))}
        {collapsed ? (
          <button
            type="button"
            className="bru-slot-chip bru-slot-chip-more"
            onClick={() => setExpanded(true)}
          >
            + {hidden} more
          </button>
        ) : null}
      </div>
    </div>
  );
}

function SlotChip({ slot }: { slot: Slot }) {
  const start = new Date(slot.start);
  return (
    <button
      type="button"
      className="bru-slot-chip"
      onClick={() => console.log("slot", slot)}
      aria-label={`Book ${fmtTime(start)}`}
    >
      {fmtTime(start)}
    </button>
  );
}

// ——— Helpers ———

type WeekDay = {
  key: string;
  label: string;
  weekdayLong: string;
  weekdayLetter: string;
  slots: Slot[];
};

type Band = { id: "morning" | "afternoon" | "evening"; label: string; slots: Slot[] };

const BAND_LABELS: Record<Band["id"], string> = {
  morning: "MORNING",
  afternoon: "AFTERNOON",
  evening: "EVENING",
};

function buildWeekDays(slots: Slot[]): WeekDay[] {
  const byKey = new Map<string, Slot[]>();
  for (const s of slots) {
    const key = makeDayKey(new Date(s.start));
    const bucket = byKey.get(key) ?? [];
    bucket.push(s);
    byKey.set(key, bucket);
  }

  const out: WeekDay[] = [];
  const today = new Date();
  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    d.setHours(0, 0, 0, 0);
    const key = makeDayKey(d);
    out.push({
      key,
      label: fmtDayLabel(d),
      weekdayLong: d.toLocaleDateString(undefined, { weekday: "long" }),
      weekdayLetter: d
        .toLocaleDateString(undefined, { weekday: "narrow" })
        .toUpperCase(),
      slots: byKey.get(key) ?? [],
    });
  }
  return out;
}

function bucketByTimeOfDay(slots: Slot[]): Band[] {
  const bands: Band[] = (
    ["morning", "afternoon", "evening"] as const
  ).map((id) => ({ id, label: BAND_LABELS[id], slots: [] }));
  for (const s of slots) {
    const h = new Date(s.start).getHours();
    const idx = h < 12 ? 0 : h < 17 ? 1 : 2;
    bands[idx].slots.push(s);
  }
  return bands;
}

function densityLevel(count: number): "0" | "1" | "2" | "3" {
  if (count === 0) return "0";
  if (count <= 3) return "1";
  if (count <= 6) return "2";
  return "3";
}

function makeDayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function scrollToDay(key: string) {
  const el = document.getElementById(`day-${key}`);
  if (el) el.scrollIntoView({ block: "start" });
}

function fmtDayLabel(d: Date): string {
  const weekday = d
    .toLocaleDateString(undefined, { weekday: "long" })
    .toUpperCase();
  const month = d
    .toLocaleDateString(undefined, { month: "short" })
    .toUpperCase();
  return `${weekday} · ${month} ${d.getDate()}`;
}

function fmtDayLabelShort(d: Date): string {
  const weekday = d
    .toLocaleDateString(undefined, { weekday: "short" })
    .toUpperCase();
  return `${weekday} ${d.getDate()}`;
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
  if (diffDays === 0) return "TODAY";
  if (diffDays === 1) return "TOMORROW";
  return `IN ${diffDays} DAYS`;
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

/**
 * IANA zone short label for visitor — e.g. "America/Los_Angeles" → "LOS ANGELES".
 * Placeholder until the host's own timezone is persisted on User (PR follow-up).
 */
function useVisitorTz(): string {
  const [tz, setTz] = useState("—");
  useEffect(() => {
    try {
      const zone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
      const tail = zone.split("/").pop() ?? zone;
      setTz(tail.replace(/_/g, " ").toUpperCase() || "—");
    } catch {
      setTz("—");
    }
  }, []);
  return tz;
}

/**
 * Mounts the `bru-ready` class on body so `.bru-reveal` fades in. The class
 * is scoped to the dashboard layout elsewhere, but the public profile uses
 * its own minimal layout and has to opt in itself.
 */
function useReadyClass() {
  useEffect(() => {
    const id = requestAnimationFrame(() =>
      document.body.classList.add("bru-ready"),
    );
    return () => {
      cancelAnimationFrame(id);
      document.body.classList.remove("bru-ready");
    };
  }, []);
}

/**
 * Scroll-spy: observe each day's top and mark the one nearest the viewport
 * top band as active. 25 lines, zero deps — IntersectionObserver with a
 * rootMargin that cuts off the top 40% and bottom 50% so only the "reading
 * zone" (center-upper) drives the active state.
 */
function useScrollSpy(ids: string[]): string | null {
  const [active, setActive] = useState<string | null>(ids[0] ?? null);
  const latestIds = useRef(ids);
  latestIds.current = ids;

  useEffect(() => {
    if (ids.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort(
            (a, b) => a.boundingClientRect.top - b.boundingClientRect.top,
          );
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-40% 0px -50% 0px", threshold: 0 },
    );
    for (const id of ids) {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [ids.join("|")]);

  return active;
}
