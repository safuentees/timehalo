"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { CalendarIcon } from "lucide-react";
import { trpc } from "@/trpc/hooks";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  AvailabilityDrawer,
  TriggerCard,
} from "@/components/calendar";
import { isOpenSlot, type Slot } from "@/lib/availability";

type Props = { handle: string };

export default function HostProfile({ handle }: Props) {
  const { data: user } = trpc.users.getByHandle.useQuery({ handle });
  const { data: slots = [] } = trpc.schedule.getUpcomingSlots.useQuery({
    handle,
  });
  const availableSlots = slots.filter(isOpenSlot);
  const nextSlot = availableSlots[0];
  const visitorTz = useVisitorTz();
  const openToday = availableSlots.some((s) => isToday(new Date(s.start)));
  const daysWithOpenSlotsThisWeek = countOpenDaysThisWeek(availableSlots);
  useReadyClass();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const [selectedSlot, setSelectedSlot] = useState<Slot | undefined>();

  if (!user) return null;

  const displayName = user.name ?? user.handle ?? "Host";
  const initials = toInitials(displayName);

  function handleSelectDate(date: Date | undefined) {
    setSelectedDate(date);

    setSelectedSlot((currentSlot) => {
      if (!currentSlot || !date) return undefined;
      return isSameCalendarDay(new Date(currentSlot.start), date)
        ? currentSlot
        : undefined;
    });
  }

  const hasSlots = slots.length > 0;
  const hasOpenSlots = availableSlots.length > 0;

  return (
    <main className="bru-main" id="top">
      <div className="bru-topbar">
        <div className="flex items-center gap-3">
          <div className="bru-monogram">OH</div>
          <div>
            <div className="bru-topbar-title">/h/{user.handle}</div>
            <div className="bru-topbar-sub">PUBLIC PROFILE</div>
          </div>
        </div>
      </div>

      <article className="bru-v1">
        <header className="bru-v1-hero bru-reveal">
          <div className="bru-v1-kicker">
            <div className="bru-v1-id">
              <Avatar size="sm" className="bru-v1-avatar">
                <AvatarImage src={user.image ?? undefined} alt={displayName} />
                <AvatarFallback className="bru-v1-avatar-fallback">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <span className="bru-v1-handle">@{user.handle}</span>
            </div>
            <span
              className={`bru-v1-status ${openToday ? "is-open" : "is-closed"}`}
            >
              <span className="bru-v1-status-dot" aria-hidden />
              {openToday ? "OPEN NOW" : "CLOSED TODAY"}
            </span>
          </div>

          <h1 className="bru-v1-name">{displayName}</h1>
          <p className="bru-v1-bio">
            Book a short conversation — writing, software, or whatever&apos;s
            been rattling around your head lately.
          </p>

          <p className="bru-v1-subtle">
            <span>
              {daysWithOpenSlotsThisWeek}{" "}
              {daysWithOpenSlotsThisWeek === 1 ? "day" : "days"} with open slots
              this week
            </span>
            {nextSlot ? (
              <>
                <span className="bru-v1-subtle-sep" aria-hidden>
                  ·
                </span>
                <span>
                  next free{" "}
                  <strong>
                    {fmtDayLabelShort(new Date(nextSlot.start))}{" "}
                    {fmtTimeCompact(new Date(nextSlot.start))}
                  </strong>
                </span>
              </>
            ) : null}
          </p>
        </header>

        <dl className="bru-v1-meta">
          <div className="bru-v1-meta-cell">
            <dt className="bru-v1-meta-label">SESSION</dt>
            <dd className="bru-v1-meta-value">15<span>M</span></dd>
          </div>
          <div className="bru-v1-meta-cell">
            <dt className="bru-v1-meta-label">OPEN</dt>
            <dd className="bru-v1-meta-value">
              {availableSlots.length.toString().padStart(2, "0")}
            </dd>
          </div>
          <div className="bru-v1-meta-cell">
            <dt className="bru-v1-meta-label">TZ</dt>
            <dd className="bru-v1-meta-value">{visitorTz}</dd>
          </div>
        </dl>
      </article>

      <section className="bru-profile-cta">
        {nextSlot ? <NextAvailable slot={nextSlot} /> : null}
        {!hasSlots ? (
          <HostEmpty displayName={displayName} kind="closed" />
        ) : !hasOpenSlots ? (
          <HostEmpty displayName={displayName} kind="booked" />
        ) : null}
      </section>

      <div className="bru-v1-spacer" aria-hidden />

      {hasOpenSlots ? (
        <>
          <div className="bru-v1-bar" role="region" aria-label="Pick a date">
            <div className="bru-v1-bar-inner">
              <TriggerCard
                selectedDate={selectedDate}
                selectedSlot={selectedSlot}
                onClick={() => setDrawerOpen(true)}
              />
            </div>
          </div>
          <AvailabilityDrawer
            handle={handle}
            slots={slots}
            open={drawerOpen}
            onOpenChange={setDrawerOpen}
            selectedDate={selectedDate}
            onSelectDate={handleSelectDate}
            selectedSlot={selectedSlot}
            onPickSlot={(s) => {
              setSelectedSlot(s);
            }}
          />
        </>
      ) : null}
    </main>
  );
}

function HostEmpty({
  displayName,
  kind,
}: {
  displayName: string;
  kind: "closed" | "booked";
}) {
  const title =
    kind === "closed" ? "No slots this week" : "Fully booked this week";
  const description =
    kind === "closed"
      ? `${displayName} hasn't opened any time yet. Check back later.`
      : `${displayName} has availability, but every visible slot is already taken. Check back later for the next opening.`;

  return (
    <div className="bru-profile-empty">
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <CalendarIcon />
          </EmptyMedia>
          <EmptyTitle>{title}</EmptyTitle>
          <EmptyDescription>{description}</EmptyDescription>
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
    </section>
  );
}

// ——— Helpers ———

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

function fmtTimeCompact(d: Date): string {
  const hour12 = ((d.getHours() + 11) % 12) + 1;
  const suffix = d.getHours() < 12 ? "AM" : "PM";
  const minute = d.getMinutes();
  return minute === 0
    ? `${hour12}${suffix}`
    : `${hour12}:${String(minute).padStart(2, "0")}${suffix}`;
}

function countOpenDaysThisWeek(slots: Slot[]): number {
  const now = new Date();
  const horizon = new Date(now);
  horizon.setDate(horizon.getDate() + 7);
  const days = new Set<string>();
  for (const s of slots) {
    const d = new Date(s.start);
    if (d >= now && d <= horizon) {
      days.add(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`);
    }
  }
  return days.size;
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

function isToday(d: Date): boolean {
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

function useVisitorTz(): string {
  return useSyncExternalStore(
    () => () => {},
    getVisitorTzLabel,
    () => "—",
  );
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

function useReadyClass() {
  useEffect(() => {
    document.body.classList.add("bru-ready");
  }, []);
}

function isSameCalendarDay(left: Date, right: Date): boolean {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function getVisitorTzLabel(): string {
  try {
    const parts = new Intl.DateTimeFormat(undefined, {
      timeZoneName: "short",
    }).formatToParts(new Date());
    const abbr = parts.find((p) => p.type === "timeZoneName")?.value ?? "";
    if (abbr && /^[A-Z]{2,5}$/i.test(abbr)) return abbr.toUpperCase();
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
    const tail = zone.split("/").pop() ?? zone;
    return tail.replace(/_/g, " ").toUpperCase() || "—";
  } catch {
    return "—";
  }
}
