"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { flushSync } from "react-dom";
import { useTranslations } from "next-intl";
import type { inferRouterOutputs } from "@trpc/server";
import { CalendarIcon } from "lucide-react";
import { trpc } from "@/trpc/hooks";
import type { AppRouter } from "@/trpc/router";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  OhEmpty,
  OhEmptyDescription,
  OhEmptyHeader,
  OhEmptyMedia,
  OhEmptyTitle,
} from "@/components/oh/oh-empty";
import { OhPageShell } from "@/components/oh/page-shell";
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
import { cn } from "@/lib/utils";

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
  const t = useTranslations("HostProfile");
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
  // URL is a mirror of the visitor's selection — start undefined so SSR
  // and the first client render agree, then hydrate from `?date=`/`?slot=`
  // in the effect below. cal.com pattern: store is the truth at runtime,
  // URL is the truth across reload/share/back.
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const [selectedSlot, setSelectedSlot] = useState<Slot | undefined>();
  // A9 — `?reschedule=<bookingUid>` puts the picker in reschedule
  // mode. Triggered from the booked confirmation page's Reschedule
  // button. Also seeded post-mount so SSR + first client render agree
  // on `undefined` (matches the URL-from-effect pattern above).
  const [rescheduleFromUid, setRescheduleFromUid] = useState<
    string | undefined
  >();

  // Seed selection from URL once on mount, after hydration. Read once;
  // popstate handles forward updates, our setters write back.
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
    // Run once — slots prop changes after this should NOT clobber the
    // visitor's selection. If a fetch returns new slots that no longer
    // contain the picked one, the drawer handles the empty case.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Browser back/forward → re-read URL → restore state inside a view
  // transition so the change feels animated, not snappy. This is the
  // "browser back plays an animation" piece — Next's auto view-transition
  // wrap only fires on router navigations, not popstate.
  useEffect(() => {
    function handlePop() {
      const dateStr = getQueryParam("date");
      const slotIso = getQueryParam("slot");
      // flushSync forces React to commit the state update synchronously
      // inside the view-transition callback. Without it, setters queue
      // an async render, the browser snapshots the unchanged DOM, and
      // no animation runs.
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

    // Mirror to URL. Date pick is transient (replaceState — no back-stack
    // entry per click), but if it cleared the slot we wipe that key too.
    updateQueryParams(
      { date: date ? toKey(date) : null, slot: nextSlotForDate?.start ?? null },
      { pushEntry: false },
    );
  }

  const hasSlots = slots.length > 0;
  const hasOpenSlots = availableSlots.length > 0;

  return (
    <main className="min-h-screen bg-oh-bg" id="top">
      {/* Slim profile bar. Mirrors the dashboard's hairline-rule rhythm
          (`/bookings`, `/settings`) — 1px structural border instead of the
          earlier 1.5px paper-and-ink slab. Eyebrow on the left carries the
          handle (the page's permanent address); right side carries the
          live open/closed indicator so it's the first thing scanned. */}
      <div className="border-b border-oh-line">
        <div className="mx-auto flex w-full max-w-[760px] items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <span className="oh-eyebrow tabular-nums opacity-100">
            /h/{user.handle}
          </span>
          <div className="flex items-center gap-2" role="status">
            <span
              aria-hidden
              className={cn(
                "size-2 shrink-0 rounded-full transition-colors duration-200 ease-oh",
                openToday ? "bg-emerald-500" : "bg-neutral-400",
              )}
            />
            <span className="oh-eyebrow opacity-100">
              {openToday ? t("openNow") : t("closedToday")}
            </span>
          </div>
        </div>
      </div>

      {/* A9 — reschedule banner. Surfaces when `?reschedule=<uid>` is in
          the URL so the visitor knows they're picking a NEW slot to swap
          into, not booking fresh. Subtle tint (oh-tint, ~6% ink) reads as
          a status strip without competing with the page's content. */}
      {rescheduleFromUid ? (
        <div
          role="status"
          className="border-b border-oh-line bg-[color:var(--oh-tint)]"
        >
          <div className="mx-auto flex w-full max-w-[760px] items-center justify-between gap-3 px-4 py-3 sm:px-6">
            <span className="oh-eyebrow opacity-100">{t("rescheduling")}</span>
            <a
              href={`/h/${user.handle}/booked/${rescheduleFromUid}`}
              className="oh-eyebrow opacity-55 transition-opacity hover:opacity-100"
            >
              {t("cancel")}
            </a>
          </div>
        </div>
      ) : null}

      <OhPageShell>
        <header className="flex flex-col gap-7">
          <div className="flex items-center gap-3">
            <Avatar size="lg">
              <AvatarImage src={user.image ?? undefined} alt={displayName} />
              <AvatarFallback className="bg-[color:var(--oh-tint)] font-[family-name:var(--oh-mono)] text-[11px] font-extrabold uppercase tracking-[1px]">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="flex flex-col leading-tight">
              <span className="oh-eyebrow opacity-100">@{user.handle}</span>
              <span className="mt-1 text-[12px] tabular-nums opacity-55">
                {t("daysWithSlots", { count: daysWithOpenSlotsThisWeek })}
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <h1 className="text-[clamp(32px,1rem+4vw,52px)] font-black leading-[1.05] tracking-tight">
              {displayName}
            </h1>
            <p className="oh-description">{t("defaultBio")}</p>
          </div>
        </header>

        {/* Meta strip — three hairline cells, mono numerals. Same vocabulary
            as the dashboard's `/settings` legend rhythm: oh-eyebrow label,
            mono-numeral value, hairline dividers. No card chrome. */}
        <dl className="mt-10 grid grid-cols-3 divide-x divide-oh-line border-y border-oh-line">
          <MetaCell
            label={t("metaSession")}
            value={
              <>
                15
                <span className="ml-0.5 text-[12px] opacity-55">m</span>
              </>
            }
          />
          <MetaCell
            label={t("metaOpen")}
            value={availableSlots.length.toString().padStart(2, "0")}
          />
          <MetaCell label={t("metaTz")} value={visitorTz} compact />
        </dl>

        <section
          className="mt-10 flex flex-col gap-6"
          aria-label={t("pickADate")}
        >
          {nextSlot ? <NextAvailable slot={nextSlot} /> : null}
          {!hasSlots ? (
            <HostEmpty displayName={displayName} kind="closed" />
          ) : !hasOpenSlots ? (
            <HostEmpty displayName={displayName} kind="booked" />
          ) : null}
          {hasOpenSlots ? (
            <TriggerCard
              selectedDate={selectedDate}
              selectedSlot={selectedSlot}
              onClick={() => setDrawerOpen(true)}
            />
          ) : null}
        </section>
      </OhPageShell>

      {hasOpenSlots ? (
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
            // Slot pick is commit-ish — pushState so browser back
            // returns to "date picked, no slot" instead of skipping
            // straight back to the page entry.
            updateQueryParam("slot", s.start, { pushEntry: true });
          }}
        />
      ) : null}
    </main>
  );
}

function MetaCell({
  label,
  value,
  compact = false,
}: {
  label: string;
  value: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5 px-4 py-4">
      <dt className="oh-eyebrow">{label}</dt>
      <dd
        className={cn(
          "font-[family-name:var(--oh-mono)] font-bold tabular-nums truncate",
          compact ? "text-[13px]" : "text-[16px]",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

function HostEmpty({
  displayName,
  kind,
}: {
  displayName: string;
  kind: "closed" | "booked";
}) {
  const t = useTranslations("HostProfile");
  const title =
    kind === "closed" ? t("emptyClosedTitle") : t("emptyBookedTitle");
  const description =
    kind === "closed"
      ? t("emptyClosedDescription", { name: displayName })
      : t("emptyBookedDescription", { name: displayName });

  return (
    <OhEmpty>
      <OhEmptyHeader>
        <OhEmptyMedia>
          <CalendarIcon />
        </OhEmptyMedia>
        <OhEmptyTitle>{title}</OhEmptyTitle>
        <OhEmptyDescription>{description}</OhEmptyDescription>
      </OhEmptyHeader>
    </OhEmpty>
  );
}

function NextAvailable({ slot }: { slot: Slot }) {
  const t = useTranslations("HostProfile");
  const startDate = new Date(slot.start);
  return (
    <section
      aria-label={t("nextSlotAria")}
      className="flex items-baseline justify-between gap-4 border-b border-oh-line pb-4"
    >
      <span className="oh-eyebrow opacity-100">{t("nextAvailable")}</span>
      <div className="flex items-baseline gap-3">
        <span className="font-[family-name:var(--oh-mono)] text-[18px] font-bold tabular-nums">
          {fmtTime(startDate)}
        </span>
        <span className="oh-eyebrow tabular-nums">
          {fmtDayLabelShort(startDate)}
        </span>
      </div>
    </section>
  );
}

// ——— Helpers ———

// Parse a "YYYY-MM-DD" key (matches lib/availability `toKey`) as local
// midnight. Avoids `new Date("2026-04-25")` which parses as UTC and
// shifts a day in negative-offset zones.
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
