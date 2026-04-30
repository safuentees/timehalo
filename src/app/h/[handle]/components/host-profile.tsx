"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { flushSync } from "react-dom";
import type { inferRouterOutputs } from "@trpc/server";
import { CalendarIcon } from "lucide-react";
import { trpc } from "@/trpc/hooks";
import type { AppRouter } from "@/trpc/router";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { OhEmpty } from "@/components/oh/oh-empty";
import {
  AvailabilityDrawer,
  TriggerCard,
} from "@/components/calendar";
import {
  isOpenSlot,
  toKey,
  type Slot,
} from "@/lib/availability";
import {
  getQueryParam,
  updateQueryParam,
  updateQueryParams,
} from "@/lib/url-params";

type RouterOutputs = inferRouterOutputs<AppRouter>;

type Props = {
  handle: string;
  initialUser: RouterOutputs["users"]["getByHandle"];
  initialSlots: RouterOutputs["schedule"]["getUpcomingSlots"];
  renderedAt: string;
};

const WEEKDAY_SHORT = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"] as const;

export default function HostProfile({
  handle,
  initialUser,
  initialSlots,
  renderedAt,
}: Props) {
  const { data: fetchedUser } = trpc.users.getByHandle.useQuery(
    { handle },
    { initialData: initialUser },
  );
  const { data: fetchedSlots } = trpc.schedule.getUpcomingSlots.useQuery(
    { handle },
    { initialData: initialSlots },
  );
  const user = fetchedUser ?? initialUser;
  const slots = fetchedSlots ?? initialSlots;
  const now = new Date(renderedAt);
  const availableSlots = slots.filter(isOpenSlot);
  const nextSlot = availableSlots[0];
  const visitorTz = useVisitorTz();
  const openToday = availableSlots.some((s) => isToday(new Date(s.start), now));
  const daysWithOpenSlotsThisWeek = countOpenDaysThisWeek(
    availableSlots,
    now,
  );

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const [selectedSlot, setSelectedSlot] = useState<Slot | undefined>();
  const [rescheduleFromUid, setRescheduleFromUid] = useState<
    string | undefined
  >();

  useEffect(() => {
    const dateStr = getQueryParam("date");
    if (dateStr) {
      const parsed = parseDateKey(dateStr);
      if (parsed) setSelectedDate(parsed);
    }
    const slotIso = getQueryParam("slot");
    if (slotIso) {
      const matching = slots.find((s) => s.start === slotIso);
      if (matching) setSelectedSlot(matching);
    }
    const rescheduleUid = getQueryParam("reschedule");
    if (rescheduleUid) {
      setRescheduleFromUid(rescheduleUid);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function handlePop() {
      const dateStr = getQueryParam("date");
      const slotIso = getQueryParam("slot");
      const apply = () =>
        flushSync(() => {
          setSelectedDate(
            dateStr ? parseDateKey(dateStr) ?? undefined : undefined,
          );
          setSelectedSlot(
            slotIso ? slots.find((s) => s.start === slotIso) : undefined,
          );
        });
      const doc = document as Document & {
        startViewTransition?: (cb: () => void) => unknown;
      };
      if (typeof doc.startViewTransition === "function") {
        doc.startViewTransition(apply);
      } else {
        apply();
      }
    }
    window.addEventListener("popstate", handlePop);
    return () => window.removeEventListener("popstate", handlePop);
  }, [slots]);

  const displayName = user.name ?? user.handle ?? "Host";
  const initials = toInitials(displayName);

  function handleSelectDate(date: Date | undefined) {
    setSelectedDate(date);

    let nextSlotForDate: Slot | undefined;
    setSelectedSlot((currentSlot) => {
      if (!currentSlot || !date) {
        nextSlotForDate = undefined;
        return undefined;
      }
      const keep = isSameCalendarDay(new Date(currentSlot.start), date)
        ? currentSlot
        : undefined;
      nextSlotForDate = keep;
      return keep;
    });

    updateQueryParams(
      { date: date ? toKey(date) : null, slot: nextSlotForDate?.start ?? null },
      { pushEntry: false },
    );
  }

  const hasSlots = slots.length > 0;
  const hasOpenSlots = availableSlots.length > 0;

  return (
    <main className="oh-main" id="top">
      <div className="oh-topbar">
        <div className="flex items-center gap-3">
          <div className="oh-monogram">OH</div>
          <div className="oh-topbar-title">/h/{user.handle}</div>
        </div>
      </div>

      {rescheduleFromUid ? (
        <div
          role="status"
          className="border-b-[1.5px] border-oh-line bg-oh-paper px-5 py-3 sm:px-8"
        >
          <div className="flex items-center justify-between gap-3">
            <span className="oh-eyebrow">RESCHEDULING — PICK A NEW SLOT</span>
            <a
              href={`/h/${user.handle}/booked/${rescheduleFromUid}`}
              className="oh-eyebrow opacity-55 transition-opacity hover:opacity-100"
            >
              CANCEL
            </a>
          </div>
        </div>
      ) : null}

      <article className="oh-v1">
        <header className="oh-v1-hero oh-reveal">
          <div className="flex flex-col gap-3">
          <div className="oh-v1-kicker">
            <div className="oh-v1-id">
              <Avatar size="sm" className="oh-v1-avatar">
                <AvatarImage src={user.image ?? undefined} alt={displayName} />
                <AvatarFallback className="oh-v1-avatar-fallback">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <span className="oh-v1-handle">@{user.handle}</span>
            </div>
            <span
              className={`oh-v1-status ${openToday ? "is-open" : "is-closed"}`}
            >
              <span className="oh-v1-status-dot" aria-hidden />
              {openToday ? "OPEN NOW" : "CLOSED TODAY"}
            </span>
          </div>

          <h1 className="oh-v1-name">{displayName}</h1>
          <p className="oh-v1-bio">
            Book a short conversation — writing, software, or whatever&apos;s
            been rattling around your head lately.
          </p>

          <p className="oh-v1-subtle">
            <span>
              {daysWithOpenSlotsThisWeek}{" "}
              {daysWithOpenSlotsThisWeek === 1 ? "day" : "days"} with open slots
              this week
            </span>
          </p>
          </div>
        </header>

        <dl className="oh-v1-meta">
          <div className="oh-v1-meta-cell">
            <dt className="oh-v1-meta-label">SESSION</dt>
            <dd className="oh-v1-meta-value">15<span>M</span></dd>
          </div>
          <div className="oh-v1-meta-cell">
            <dt className="oh-v1-meta-label">OPEN</dt>
            <dd className="oh-v1-meta-value">
              {availableSlots.length.toString().padStart(2, "0")}
            </dd>
          </div>
          <div className="oh-v1-meta-cell">
            <dt className="oh-v1-meta-label">TZ</dt>
            <dd className="oh-v1-meta-value">{visitorTz}</dd>
          </div>
        </dl>
      </article>

      <section className="oh-profile-cta">
        {nextSlot ? <NextAvailable slot={nextSlot} /> : null}
        {!hasSlots ? (
          <HostEmpty displayName={displayName} kind="closed" />
        ) : !hasOpenSlots ? (
          <HostEmpty displayName={displayName} kind="booked" />
        ) : null}
      </section>

      <div className="oh-v1-spacer" aria-hidden />

      {hasOpenSlots ? (
        <>
          <div className="oh-v1-bar" role="region" aria-label="Pick a date">
            <div className="oh-v1-bar-inner">
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
            rescheduleFromUid={rescheduleFromUid}
            onPickSlot={(s) => {
              setSelectedSlot(s);
              updateQueryParam("slot", s.start, { pushEntry: true });
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
    <div className="oh-profile-empty">
      <OhEmpty
        icon={CalendarIcon}
        title={title}
        description={description}
      />
    </div>
  );
}

function NextAvailable({ slot }: { slot: Slot }) {
  const startDate = new Date(slot.start);
  return (
    <section className="oh-next-available oh-reveal" aria-label="Next available slot">
      <span className="oh-next-available-kicker">NEXT AVAILABLE</span>
      <div className="oh-next-available-body">
        <span className="oh-next-available-time">{fmtTime(startDate)}</span>
        <span className="oh-next-available-meta">
          {fmtDayLabelShort(startDate)}
        </span>
      </div>
    </section>
  );
}

function parseDateKey(key: string): Date | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) return undefined;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function fmtDayLabelShort(d: Date): string {
  return `${WEEKDAY_SHORT[d.getDay()]} ${d.getDate()}`;
}

function fmtTime(d: Date): string {
  const hour24 = d.getHours();
  const hour12 = ((hour24 + 11) % 12) + 1;
  const suffix = hour24 < 12 ? "AM" : "PM";
  return `${hour12}:${String(d.getMinutes()).padStart(2, "0")} ${suffix}`;
}

function countOpenDaysThisWeek(slots: Slot[], now: Date): number {
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

function isToday(d: Date, now: Date): boolean {
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
