"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { flushSync } from "react-dom";
import { useTranslations } from "next-intl";
import type { inferRouterOutputs } from "@trpc/server";
import { trpc } from "@/trpc/hooks";
import type { AppRouter } from "@/trpc/router";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { OhVisitorShell } from "@/components/oh/oh-visitor-shell";
import { AvailabilityDrawer } from "@/components/calendar";
import { isOpenSlot, toKey, type Slot } from "@/lib/availability";
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

  // B.PT155 — visitor-page redesign frame 1 (handle landing).
  // 1-to-1 port of `desktop - dashboard / handle` (324:15683) in the
  // user's Figma file (spec at `docs/figma/spec-h-handle-redesign.json`).
  //
  // Layout (Figma absolute geometry):
  //   - Outer chrome: `oh-host-content` Sisal frame (existing token,
  //     #EEE7D5 paper inside #D3CCBD frame). Provided by OhVisitorShell.
  //   - Sticky header: `/h/<handle>` eyebrow left + 8px status dot +
  //     status eyebrow right. (Same shape as B.PT110, the redesign
  //     keeps the chrome.)
  //   - Centered card 385×387, padding 15, gap 10 between header
  //     section and slot-list section. Paper bg, cornerRadius 25,
  //     1px hairline border.
  //     - Identity header (Frame 15, 336×87): avatar 55×55 fully
  //       rounded with 1px ring + h1 name (Space Grotesk Bold ~52px,
  //       size 269×55) on the same row, gap 12; then
  //       `oh-description` tagline below (336×20).
  //     - Slot-list inner card (Frame 2, 355×260): cream bg (#F5EFDF
  //       — between paper and white, no existing token; explicit hex
  //       per 1-to-1 directive), cornerRadius 20, 1px border, padding
  //       15 + gap 10. Contains 4 slot rows (each 325×50, paper bg,
  //       cornerRadius 14, gap 10 between).
  //
  // 1-to-1 visual fidelity directive (user, 2026-05-05): hardcode the
  // 4 slot row contents — "intro / quick chat, voice only / 15m | 25m
  // | 30m | 1h" — even though we don't have a multi-event-type model
  // per host yet (all bookings today are 15-min single-type slots).
  // The data-model gap is logged as B.PT158 (canonical-win, OPEN /
  // OPTIONAL — don't implement until promoted).
  //
  // Click semantics: tapping any slot row opens the existing
  // `<AvailabilityDrawer>` so the booking flow stays functional while
  // B.PT156 lands the bespoke modal redesign that replaces the drawer.

  return (
    <OhVisitorShell
      header={
        <div className="mx-auto flex w-full max-w-[760px] items-center justify-between gap-3 px-0">
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
      }
    >
      {/* A9 — reschedule banner. Surfaces when `?reschedule=<uid>` is in
          the URL so the visitor knows they're picking a NEW slot to swap
          into, not booking fresh. Subtle tint (oh-tint, ~6% ink) reads as
          a status strip without competing with the page's content. Sits
          ABOVE the centered card so it doesn't compete with the card's
          white space. */}
      {rescheduleFromUid ? (
        <div
          role="status"
          className="border-b border-oh-line bg-[color:var(--oh-tint)]"
        >
          <div className="mx-auto flex w-full max-w-[760px] items-center justify-between gap-3 px-4 py-3 sm:px-6">
            <span className="oh-eyebrow opacity-100">{t("rescheduling")}</span>
            <a
              href={`/h/${user.handle}/booked/${rescheduleFromUid}`}
              className="oh-focus-ring oh-eyebrow rounded-(--oh-r-xs) opacity-55 transition-opacity hover:opacity-100"
            >
              {t("cancel")}
            </a>
          </div>
        </div>
      ) : null}

      {/* Centered-card scaffold. The card is exactly 385×387 per Figma;
          on viewports narrower than ~415px the card shrinks to fit
          (w-full + max-w-[385px] + horizontal padding on the wrapper).
          Vertical centering uses min-h calc that subtracts the sticky
          header's nominal height (~64px on mobile / 80px sm+) so the
          card visually sits in the OPTICAL center of the remaining
          viewport, not a literal middle that includes the header. */}
      <div className="flex w-full justify-center px-4 py-10 sm:py-14">
        <article
          aria-label={t("landingCardAria", { name: displayName })}
          className={cn(
            "flex w-full max-w-[385px] flex-col gap-[10px] p-[15px]",
            "rounded-[25px] border border-oh-line bg-[color:var(--oh-paper)]",
          )}
        >
          {/* Identity header — Frame 15 (336×87) */}
          <header className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <span className="relative inline-flex size-[55px] shrink-0">
                <Avatar className="size-[55px]">
                  <AvatarImage src={user.image ?? undefined} alt={displayName} />
                  <AvatarFallback className="size-[55px] bg-[color:var(--oh-tint)] font-[family-name:var(--oh-mono)] text-[11px] font-extrabold uppercase tracking-[1px]">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                {/* ::after — 1px ring overlay matching Figma. Lives on
                    top of the image so the ring stays crisp when the
                    avatar image fills the circle. */}
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-0 rounded-full ring-1 ring-[color:var(--oh-line)]"
                />
              </span>
              <h1 className="font-sans text-[clamp(32px,1rem+4vw,52px)] font-black leading-[1.06] tracking-tight">
                {displayName}
              </h1>
            </div>
            <p className="oh-description">{t("defaultBio")}</p>
          </header>

          {/* Slot-list inner card — Frame 2 (355×260). Cream bg
              (#F5EFDF in Figma) is between paper (#EEE7D5) and white;
              no existing token, so explicit hex per the 1-to-1 directive.
              Empty / closed-host states render the existing HostEmpty
              shape inside the same card (same chrome, different content)
              so the layout stays anchored. */}
          <div
            className={cn(
              "flex flex-col gap-2.5 rounded-[20px] border border-oh-line p-[15px]",
              "bg-[#F5EFDF]",
            )}
          >
            {hasOpenSlots ? (
              <ul className="flex flex-col gap-2.5">
                {SLOT_OPTIONS.map((opt) => (
                  <li key={opt.label}>
                    <SlotRow
                      title="intro"
                      description="quick chat, voice only"
                      durationLabel={opt.label}
                      onClick={() => setDrawerOpen(true)}
                    />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="oh-description py-6 text-center">
                {!hasSlots
                  ? t("emptyClosedDescription", { name: displayName })
                  : t("emptyBookedDescription", { name: displayName })}
              </p>
            )}
          </div>
        </article>
      </div>

      {/* Visitor TZ probe + days-with-slots are computed but not surfaced
          in the new landing layout — kept around because the AvailabilityDrawer
          still relies on the same query state. The values themselves are
          re-derived inside the drawer; passing them through props is a
          drawer-API concern that B.PT156's bespoke modal will obviate. */}
      <span className="sr-only" aria-hidden>
        {visitorTz} · {daysWithOpenSlotsThisWeek} · {nextSlot?.start ?? ""}
      </span>

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
            updateQueryParam("slot", s.start, { pushEntry: true });
          }}
        />
      ) : null}
    </OhVisitorShell>
  );
}

// 1-to-1 hardcoded slot durations from Figma frame 1 (B.PT155).
// Real multi-event-type wiring is B.PT158 (canonical-win, deferred).
const SLOT_OPTIONS = [
  { label: "15 min" },
  { label: "25 min" },
  { label: "30 min" },
  { label: "1 hr" },
] as const;

// Slot row — 325×50 button, paper bg, rounded-14 (Figma cornerRadius).
// Layout: title + description on the left (stacked), duration label on
// the right. Click opens the AvailabilityDrawer (preserved booking flow
// until B.PT156's bespoke modal lands).
function SlotRow({
  title,
  description,
  durationLabel,
  onClick,
}: {
  title: string;
  description: string;
  durationLabel: string;
  onClick: () => void;
}) {
  // Split duration label into number + unit so the unit can render at
  // a smaller mono size, matching Figma where "15" is 30px-ish and
  // "min" / "hr" sits at ~15px below the number.
  const match = /^(\d+)\s*(.+)$/.exec(durationLabel);
  const num = match?.[1] ?? durationLabel;
  const unit = match?.[2] ?? "";
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "oh-focus-ring group/slot flex h-[50px] w-full items-center justify-between gap-3",
        "rounded-[14px] bg-[color:var(--oh-paper)] px-3 text-left",
        "transition-colors duration-150 ease-oh hover:bg-[color:var(--oh-tint)]",
      )}
    >
      <div className="flex min-w-0 flex-col leading-tight">
        <span className="truncate font-sans text-[15px] font-bold leading-[20px]">
          {title}
        </span>
        <span className="truncate font-sans text-[12px] leading-[15px] opacity-65">
          {description}
        </span>
      </div>
      <div className="flex items-baseline gap-1 shrink-0 font-[family-name:var(--oh-mono)] tabular-nums">
        <span className="text-[24px] font-bold leading-none">{num}</span>
        {unit ? (
          <span className="text-[11px] font-bold leading-none opacity-65">
            {unit}
          </span>
        ) : null}
      </div>
    </button>
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
