"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { flushSync } from "react-dom";
import { useTranslations } from "next-intl";
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
    <main className="oh-main" id="top">
      <div className="oh-topbar">
        <div className="flex items-center gap-3">
          <div className="oh-monogram" aria-label={t("brandLabel")}>
            OH
          </div>
          <div className="oh-topbar-title">/h/{user.handle}</div>
        </div>
      </div>

      {/* A9 — reschedule banner. Surfaces when `?reschedule=<uid>`
          is in the URL so the visitor knows they're picking a NEW
          slot to swap into, not booking fresh. The slot-picker
          drawer's confirm panel shows the from→to delta. */}
      {rescheduleFromUid ? (
        <div
          role="status"
          className="border-b-[1.5px] border-oh-line bg-oh-paper px-5 py-3 sm:px-8"
        >
          <div className="flex items-center justify-between gap-3">
            <span className="oh-eyebrow">{t("rescheduling")}</span>
            <a
              href={`/h/${user.handle}/booked/${rescheduleFromUid}`}
              className="oh-eyebrow opacity-55 transition-opacity hover:opacity-100"
            >
              {t("cancel")}
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
              role="status"
              className={`oh-v1-status ${openToday ? "is-open" : "is-closed"}`}
            >
              <span className="oh-v1-status-dot" aria-hidden />
              {openToday ? t("openNow") : t("closedToday")}
            </span>
          </div>

          <h1 className="oh-v1-name">{displayName}</h1>
          <p className="oh-v1-bio">{t("defaultBio")}</p>

          <p className="oh-v1-subtle">
            <span>{t("daysWithSlots", { count: daysWithOpenSlotsThisWeek })}</span>
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
          <div className="oh-v1-bar" role="region" aria-label={t("pickADate")}>
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
              // Slot pick is commit-ish — pushState so browser back
              // returns to "date picked, no slot" instead of skipping
              // straight back to the page entry.
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
  const t = useTranslations("HostProfile");
  const title =
    kind === "closed" ? t("emptyClosedTitle") : t("emptyBookedTitle");
  const description =
    kind === "closed"
      ? t("emptyClosedDescription", { name: displayName })
      : t("emptyBookedDescription", { name: displayName });

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
  const t = useTranslations("HostProfile");
  const startDate = new Date(slot.start);
  return (
    <section
      className="oh-next-available oh-reveal"
      aria-label={t("nextSlotAria")}
    >
      <span className="oh-next-available-kicker">{t("nextAvailable")}</span>
      <div className="oh-next-available-body">
        <span className="oh-next-available-time">{fmtTime(startDate)}</span>
        <span className="oh-next-available-meta">
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
