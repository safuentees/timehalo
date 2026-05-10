"use client";

import {
  forwardRef,
  useMemo,
  useOptimistic,
  useRef,
  useState,
  useTransition,
} from "react";
import { useFormatter, useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarIcon, MailIcon } from "lucide-react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { restrictToFirstScrollableAncestor } from "@dnd-kit/modifiers";
import { trpc } from "@/trpc/hooks";
import { cn } from "@/lib/utils";
import { useRescheduleBooking } from "@/lib/mutations/use-reschedule-booking";
import {
  pixelToTime,
  snapPixelToGrid,
} from "@/lib/calendar-grid/event-geometry";
import { ConfirmDialog } from "@/components/oh/confirm-dialog";
import { BookingHoverPreview } from "./booking-hover-preview";
import { EventChip } from "./calendar/event-chip";
import type { DraggableEventDragData } from "./calendar/draggable-event-chip";
import type { TimeGridDropData } from "./calendar/time-grid-column";
import {
  validateDrop,
  type AvailabilityRange,
} from "./calendar/drop-validation";
import {
  OhEmpty,
  OhEmptyContent,
  OhEmptyDescription,
  OhEmptyHeader,
  OhEmptyMedia,
  OhEmptyTitle,
} from "@/components/oh/oh-empty";
import { OhInlineEmpty } from "@/components/oh/inline-empty";
import { OhPageHeader } from "@/components/oh/page-header";
import { OhPageShell } from "@/components/oh/page-shell";
import { usePageTitle } from "@/components/oh/page-title-context";
import { OnboardingChecklist } from "@/components/oh/onboarding-checklist";
import { OhPillSwitcher } from "@/components/oh/oh-pill-switcher";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  // List view tab bar uses OhPillSwitcher now; the legacy
  // `BookingsTabBar` (GSAP-underline) below is retained for the
  // /playground/animations/bookings-tabs reference page only.
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import type { CalendarEvent } from "@/lib/calendar-grid/types";
import { BookingDetailModal } from "./booking-detail-modal";
import {
  BookingsViewSwitcher,
  type ViewMode,
} from "./bookings-view-switcher";
import { DayView } from "./calendar/day-view";
import { WeekView } from "./calendar/week-view";
import { MonthView } from "./calendar/month-view";
import { BookingsCursorControls } from "./calendar/cursor-controls";
import { DayStrip } from "./calendar/day-strip";

export type Tab = "upcoming" | "past";

const VALID_TABS = ["upcoming", "past"] as const satisfies readonly Tab[];

// Page-level client component for /bookings. Reads bookings from the
// hydrated React Query cache (set up by `page.tsx`'s
// `<HydrationBoundary>`) via `useQuery` — NOT `useSuspenseQuery`.
//
// HISTORICAL NOTE (B.PT39 → B.PT40):
// B.PT39 split this into a granular-Suspense pattern (chrome sync,
// rows in a `<Suspense>` calling `useSuspenseQuery`). That broke
// SSR: with our legacy `@trpc/react-query` proxy, the queryClient
// inside the `<HydrationBoundary>` is a separate instance from the
// one `createServerSideHelpers` populates. When the server-rendered
// `BookingsRows` (client component) called `useSuspenseQuery`, the
// cache it saw was empty (different queryClient than the prefetched
// one), and `useSuspenseQuery` tried to call the queryFn — which
// for tRPC is the `httpBatchLink` with a relative `/api/trpc/...`
// URL. Node's `fetch` can't parse relative URLs, so SSR threw and
// Next fell back to client rendering. Tanstack's modern fix
// (`@tanstack/react-query-next-experimental` + the streaming
// hydration provider) is a new dep + rewrite of `provider.tsx`;
// the pragmatic fix is to use `useQuery` (no suspend, no SSR
// fetch attempt) and rely on `HydrationBoundary`'s synchronous
// hydration during client mount. Matches the upstream
// `fix/next-pin-16.1.7` shape verbatim.
//
// Tab state lives in the URL (`?tab=upcoming|past`, only used when
// view=list). View-mode state ALSO lives in the URL
// (`?view=day|week|month|list`, default list — preserves legacy
// behavior). `activeTab` and `activeView` are passed in via props
// from `page.tsx`'s `searchParams` read; changes push to the URL
// via `router.push`, which re-runs the page's server tree without a
// full reload. `cursorDate` is the calendar's reference date — also
// URL-driven (`?date=YYYY-MM-DD`); B.PT140 wires the prev/today/
// next controls. For now the cursor is read-only from the URL.
export function BookingsList({
  activeTab,
  activeView,
  cursorDate,
}: {
  activeTab: Tab;
  activeView: ViewMode;
  cursorDate: Date;
}) {
  const t = useTranslations("Bookings");
  // B.PT287 — month grid is desktop-only. On <md viewports we render
  // the URL's `?view=month` AS list (mirrors what the surface is
  // physically capable of showing) so:
  //   1. The OhPillSwitcher highlights "list" instead of an option
  //      that's display:none (avoids "no pill is highlighted" UX).
  //   2. We don't render two copies of the list view stacked.
  // SSR returns false from useIsMobile so the desktop branch (full
  // month grid) paints first; the swap to list happens after mount,
  // which is fine since both branches share the same outer layout.
  const isMobile = useIsMobile();
  const effectiveView: ViewMode =
    isMobile && activeView === "month" ? "list" : activeView;

  // B.PT293 — opportunistic UI for view/tab/cursor navigation.
  // Each routing action wraps `router.push` in `useTransition` so
  // React keeps the existing UI interactive while the new server
  // tree resolves (cal.com pattern in
  // `useSwitchToCorrectStatusTab.ts:54`). We pair that with
  // `useOptimistic` so the active-pill, tab indicator, and cursor
  // label LEAD the URL update — the chrome jumps to the next
  // value the moment the click registers, then the URL catches up.
  // React 19 docs: react.dev/reference/react/useOptimistic — "use
  // useOptimistic to optimistically update the UI by showing a
  // different state during an async action that's still in
  // flight." Combined with `useTransition`, this is the modern
  // canonical pattern for optimistic chrome on routing-driven
  // tabs / segmented controls.
  const [isPending, startTransition] = useTransition();
  const [optimisticView, setOptimisticView] = useOptimistic(effectiveView);
  const [optimisticTab, setOptimisticTab] = useOptimistic(activeTab);
  const [optimisticCursor, setOptimisticCursor] = useOptimistic(cursorDate);
  const router = useRouter();
  const { data, isError, error } = trpc.bookings.listForHost.useQuery();
  const { data: flags } = trpc.users.featureFlags.useQuery();
  // B.PT152 — drop-validation pre-flight needs the host's
  // availability ranges. The /bookings/page.tsx already prefetches
  // schedule.get (it powers OnboardingChecklist), so this hits the
  // hydrated cache and doesn't trigger a new request.
  const { data: scheduleRanges } = trpc.schedule.get.useQuery();
  const liveQueueEnabled = flags?.["live-queue"] ?? false;

  // Selected booking for the detail modal. State-driven instead of
  // intercepted-route navigation — the modal opens synchronously, no
  // server roundtrip, and prev/next chevrons swap content in place.
  // Hard refresh / cmd-click on a row still hits the standalone page
  // route at /bookings/[publicUid].
  const [selectedUid, setSelectedUid] = useState<string | null>(null);

  // B.PT150 — drag-to-reschedule state.
  //
  // `activeDrag` mirrors the chip being dragged so the DragOverlay
  // can render its visual ghost. We snapshot the original event +
  // computed pixel translation so the overlay can place itself
  // without re-deriving geometry per frame.
  //
  // `pending` carries the (event, candidate slotStart) that the user
  // dropped on a target. The ConfirmDialog reads it; `null` =
  // dialog hidden. Confirming calls the mutation; cancelling clears
  // pending. Same shape the workflow / api-keys destructive flows
  // use (per `oh-ui.md` *Destructive actions* — confirm-dialog over
  // single-click, ConfirmDialog primitive over hand-rolled).
  const [activeDrag, setActiveDrag] = useState<CalendarEvent | null>(null);
  const [pending, setPending] = useState<{
    event: CalendarEvent;
    newSlotStart: Date;
    durationMin: number;
  } | null>(null);

  // dnd-kit sensors — Pointer + Keyboard.
  //
  // PointerSensor.distance: 8 — drag only activates after the pointer
  // moves 8px. Plain clicks (and cmd-clicks → href) on the chip still
  // reach EventChip's onClick handler. The threshold also debounces
  // accidental drags from a slightly-shaky click on a touchpad.
  //
  // KeyboardSensor — Tab to focus chip, Space/Enter to lift, Arrow
  // keys to step, Space/Enter to drop, Escape to cancel. dnd-kit's
  // default keyboard codes match WCAG 2.1.1.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor),
  );

  const reschedule = useRescheduleBooking({
    onSuccess: () => {
      toast.success(t("rescheduleSuccess"));
      setPending(null);
    },
  });

  // Combined booking → CalendarEvent adapter for the calendar views.
  // listForHost only returns deleted=false rows, so all events are
  // status: "confirmed" — cancellations don't surface here today.
  // Adjacent prev/past split (`data.upcoming` / `data.past`) is
  // irrelevant for the calendar; the views filter to their visible
  // date range internally.
  const calendarEvents: CalendarEvent[] = useMemo(() => {
    if (!data) return [];
    const all = [...data.upcoming, ...data.past];
    return all.map((b) => ({
      id: b.publicUid,
      title: b.visitorName,
      start: new Date(b.slotStart as unknown as string),
      end: new Date(b.slotEnd as unknown as string),
      status: "confirmed" as const,
      refId: b.publicUid,
    }));
  }, [data]);

  // View switcher: push `?view=...` (preserve `?tab=...` so the user
  // who switches list → week → list lands back on their original tab,
  // and `?date=...` so the cursor doesn't reset when the user flips
  // between calendar modes).
  // B.PT293 — wraps router.push in startTransition so the old UI
  // stays interactive during navigation, and updates optimistic
  // state synchronously so the active pill jumps immediately.
  const onViewChange = (next: ViewMode) => {
    if (next === optimisticView) return;
    const params = new URLSearchParams();
    params.set("view", next);
    if (next === "list") {
      params.set("tab", optimisticTab);
    } else {
      params.set("date", formatDateParam(optimisticCursor));
    }
    startTransition(() => {
      setOptimisticView(next);
      router.push(`?${params.toString()}`, { scroll: false });
    });
  };

  // Cursor date controls (B.PT140) — push `?date=YYYY-MM-DD`
  // alongside `?view=`. URL state stays the source of truth so back/
  // forward + bookmark + cmd-click all work consistently.
  // B.PT293 — optimistic cursor update so the date label flips
  // before the server tree commits.
  const onDateChange = (next: Date) => {
    const params = new URLSearchParams();
    params.set("view", optimisticView);
    params.set("date", formatDateParam(next));
    startTransition(() => {
      setOptimisticCursor(next);
      router.push(`?${params.toString()}`, { scroll: false });
    });
  };

  // Tab switcher (Upcoming / Past in list view).
  // B.PT293 — optimistic update so the active pill flips
  // immediately on click; URL update follows in the transition.
  const onTabChange = (next: Tab) => {
    if (next === optimisticTab) return;
    startTransition(() => {
      setOptimisticTab(next);
      router.push(`?view=list&tab=${next}`, { scroll: false });
    });
  };

  const onEventClick = (event: CalendarEvent) => {
    if (event.refId) setSelectedUid(event.refId);
  };

  // B.PT150 — drag start: cache the active event so the DragOverlay
  // can render its ghost. dnd-kit's `event.active.data.current` is
  // the payload we put on the draggable; we look the full event up
  // by refId from `calendarEvents` so the overlay has the same
  // primitive the time-grid uses.
  const onDragStart = (e: DragStartEvent) => {
    const data = e.active.data.current as DraggableEventDragData | undefined;
    if (!data || data.type !== "event") return;
    const ev = calendarEvents.find((c) => (c.refId ?? c.id) === data.refId);
    if (ev) setActiveDrag(ev);
  };

  // Drop handler.
  //
  // Three things to compute:
  //   1. Did the chip land on a TimeGridColumn? If not (overlay
  //      released outside any droppable), bail.
  //   2. The new slotStart in wall-clock time. dnd-kit gives us
  //      `delta.y` (pixels moved from drag start). Translate the
  //      original event's top-pixel + delta → snap to 15-minute
  //      grid → pixelToTime against the COLUMN's date (so cross-day
  //      drops to a different column resolve to the new column's
  //      day, not the source's).
  //   3. Duration (end - start) is preserved; the new slotEnd is
  //      derived server-side from the EventType's duration anyway,
  //      but we surface the new slot range in the confirm dialog so
  //      the host sees what they're committing to.
  //
  // v1 same-day-only: if `over.data.current.dateIso` differs from
  // the source event's date, we still allow the drop — the
  // procedure handles the time math and the audit chain captures
  // the swap. (Cross-day drag works as long as both columns are in
  // the same DndContext, which they are in WeekView.)
  const onDragEnd = (e: DragEndEvent) => {
    setActiveDrag(null);
    const { active, over, delta } = e;
    if (!over) return;

    const dragData = active.data.current as DraggableEventDragData | undefined;
    const dropData = over.data.current as TimeGridDropData | undefined;
    if (!dragData || dragData.type !== "event") return;
    if (!dropData || dropData.type !== "time-grid-column") return;

    const sourceEvent = calendarEvents.find(
      (c) => (c.refId ?? c.id) === dragData.refId,
    );
    if (!sourceEvent || !sourceEvent.refId) return;

    const { startHour, oneMinuteHeightPx } = dropData;
    const targetDate = parseColumnDate(dropData.dateIso);

    // Original chip's top pixel inside ITS source column. Compute
    // from the source event's start hour + minutes (same math
    // eventToGridPosition uses, abbreviated since we just need the
    // start pixel).
    const sourceStart = new Date(dragData.startMs);
    const sourceTopPx =
      ((sourceStart.getHours() - startHour) * 60 + sourceStart.getMinutes()) *
      oneMinuteHeightPx;
    // New top pixel inside the target column = source top + drag delta.
    const newTopPx = snapPixelToGrid(sourceTopPx + delta.y, {
      oneMinuteHeightPx,
      stepMinutes: 15,
    });
    const newSlotStart = pixelToTime(newTopPx, targetDate, {
      startHour,
      oneMinuteHeightPx,
    });

    // No-op drop (same time + same day): skip the dialog.
    if (newSlotStart.getTime() === sourceEvent.start.getTime()) return;

    // B.PT152 — pre-flight validation. The procedure's NOT_FOUND /
    // CONFLICT cases (slot occupied by another booking, or outside
    // host availability) surfaced as confusing 404 in the network
    // tab + a generic toast. We can detect both client-side from
    // data the page already has (calendarEvents from
    // bookings.listForHost; ranges from schedule.get), so we abort
    // before opening the confirm dialog and show a precise toast.
    // The procedure remains source of truth — a race (someone else
    // books the slot in the gap between drop and confirm) still
    // falls through to the procedure's CONFLICT and the mutation
    // hook's error toast.
    const validation = validateDrop({
      newSlotStart,
      sourceRefId: sourceEvent.refId,
      events: calendarEvents,
      ranges: (scheduleRanges ?? []) as AvailabilityRange[],
    });
    if (!validation.ok) {
      const reasonKey =
        validation.reason === "slot-occupied"
          ? "rescheduleSlotTaken"
          : validation.reason === "outside-availability"
            ? "rescheduleOutsideAvailability"
            : "rescheduleSlotInPast";
      toast.error(t(reasonKey));
      return;
    }

    const durationMin = Math.round(
      (sourceEvent.end.getTime() - sourceEvent.start.getTime()) / 60_000,
    );
    setPending({ event: sourceEvent, newSlotStart, durationMin });
  };

  const onConfirmReschedule = async () => {
    if (!pending) return;
    if (!pending.event.refId) return;
    await reschedule.mutateAsync({
      oldPublicUid: pending.event.refId,
      newSlotStart: pending.newSlotStart.toISOString(),
      idempotencyKey: crypto.randomUUID(),
    });
  };

  // Cmd+click parity (B.PT142). Calendar chips become `<a>` with
  // this href so power users open the standalone deep link in a new
  // tab. Same pattern as the list rows. The `<BookingDetailModal>`
  // is the canonical surface; the standalone page survives as the
  // hard-refresh / new-tab fallback (per B.PT138).
  const getEventHref = (event: CalendarEvent) =>
    event.refId ? `/bookings/${event.refId}` : "#";

  // Month "+N MORE" overflow handler (B.PT145). Clicking jumps to
  // Day view for that date — uses existing routing instead of
  // building a popover primitive. The href is also passed so cmd-
  // click opens the day view in a new tab.
  const onOverflowClick = (date: Date) => {
    const params = new URLSearchParams();
    params.set("view", "day");
    params.set("date", formatDateParam(date));
    router.push(`?${params.toString()}`, { scroll: false });
  };
  const getOverflowHref = (date: Date) =>
    `/bookings?view=day&date=${formatDateParam(date)}`;

  // Per-view width caps (B.PT143). Cal.com's booker takes the
  // opposite extreme — `width: 100vw, minHeight: 100vh` on week —
  // but we have a sidebar + topbar to coexist with, so the cap is
  // bounded by what feels right at each density:
  //   day     760px   single column; sprawling at 1440 looks empty
  //   week    1440px  7 columns × ~190px each on a 1440 viewport
  //   month   1200px  7 columns × ~165px each, comfortable for chips
  const calendarMaxWidthClass = (() => {
    switch (optimisticView) {
      case "day":
        return "max-w-[760px]";
      case "week":
        return "max-w-[1440px]";
      case "month":
        return "max-w-[1200px]";
      default:
        return "max-w-[760px]";
    }
  })();

  // B.PT304 — page title surfaces in the topbar (≥md) via the
  // PageTitleProvider. Frees the calendar mode from the ~80-100px
  // OhPageHeader chrome cost in-column. Mobile (<md) still sees the
  // in-column header in list mode (the onboarding card + tabs need
  // narrative); calendar mobile relies on cursor controls for the
  // date context, which is the only thing the user actually needs
  // there.
  usePageTitle(t("title"));
  const isCalendarView = optimisticView !== "list";

  return (
    <>
      {/* List mode keeps the standard 760px shell + in-column header.
          Calendar mode escapes the shell entirely (header hidden,
          view switcher folds into the calendar wrapper above the
          cursor controls) so the grid claims maximum vertical
          space. */}
      {!isCalendarView ? (
        <OhPageShell>
          <OhPageHeader
            title={t("title")}
            aside={liveQueueEnabled ? <LiveQueue /> : null}
          />

          <OnboardingChecklist />

          <div className="mt-8">
            <BookingsViewSwitcher
              value={optimisticView}
              onValueChange={onViewChange}
            />
          </div>

          <div className="mt-6">
            <OhPillSwitcher
              ariaLabel={t("tablistLabel")}
              value={optimisticTab}
              onChange={onTabChange}
              fullWidth
              options={[
                {
                  value: "upcoming",
                  label: (
                    <BookingsTabLabel
                      label={t("tabUpcoming")}
                      count={data?.upcoming.length ?? 0}
                      isActive={optimisticTab === "upcoming"}
                    />
                  ),
                },
                {
                  value: "past",
                  label: (
                    <BookingsTabLabel
                      label={t("tabPast")}
                      count={data?.past.length ?? 0}
                      isActive={optimisticTab === "past"}
                    />
                  ),
                },
              ]}
            />
          </div>

          <div className="mt-6">
            {optimisticTab === "upcoming" ? (
              <BookingsListPanel
                tab="upcoming"
                bookings={data?.upcoming ?? []}
                onSelect={setSelectedUid}
              />
            ) : (
              <BookingsListPanel
                tab="past"
                bookings={data?.past ?? []}
                onSelect={setSelectedUid}
              />
            )}
          </div>
        </OhPageShell>
      ) : null}

      {isCalendarView ? (
        // Calendar mode: escape the OhPageShell width cap so each
        // view can use its appropriate max width (week 1440, month
        // 1200, day 760). Outer wrapper provides the same horizontal
        // padding as OhPageShell so the chrome aligns with the
        // header above.
        //
        // B.PT150 — wrap the entire calendar tree in a single
        // DndContext so dragging a chip across columns in WeekView
        // works without per-view contexts. Sensors registered above;
        // `restrictToFirstScrollableAncestor` modifier confines the
        // drag overlay's translation to the same scroll container the
        // calendar lives in (prevents the ghost from escaping into
        // the page header / sidebar during long drags).
        <DndContext
          sensors={sensors}
          modifiers={[restrictToFirstScrollableAncestor]}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          onDragCancel={() => setActiveDrag(null)}
        >
        {/* B.PT304 — outer absolute cover. Anchors to ContentSlot's
            motion.div (which carries `relative`) so the calendar
            mode occupies EXACTLY the Viewport bounds, bypassing the
            broken flex chain through the Radix ScrollArea Viewport
            (which wraps children in a `display: table` div that
            doesn't pass flex resolution through to descendants).
            Inside, the inner div carries the per-view max-width cap
            and `flex-1 min-h-0` on the calendar view claims the
            remaining vertical space — page never scrolls, the
            calendar's internal overflow-y-auto does. */}
        <div className="absolute inset-0 flex flex-col">
        <div
          aria-busy={isPending || undefined}
          className={cn(
            "mx-auto flex w-full min-h-0 flex-1 flex-col gap-3 px-4 pb-4 pt-4 sm:px-6 sm:pb-6",
            calendarMaxWidthClass,
            isPending &&
              "opacity-70 transition-opacity duration-150 ease-oh",
          )}
        >
          {/* View switcher folded into the calendar wrapper now
              that the OhPageShell is hidden above. Mobile +
              desktop both render here so users can swap views
              without scrolling back up to a separate chrome
              band. */}
          <BookingsViewSwitcher
            value={optimisticView}
            onValueChange={onViewChange}
          />
          <BookingsCursorControls
            view={optimisticView}
            cursorDate={optimisticCursor}
            onDateChange={onDateChange}
          />

          {/* Error banner — shows if the bookings query failed. The
              calendar still renders below so the host sees the
              empty grid structure; the banner makes the failure
              visible + actionable. Page-level prefetch + Hydration-
              Boundary means this is rare in practice (initial paint
              has data) — covers the "user changed view, query
              refetched, network blip" case. */}
          {isError ? (
            <OhInlineEmpty>
              {t("errorLoading")}
              {error?.message ? ` — ${error.message}` : null}
            </OhInlineEmpty>
          ) : null}

          {/* No-bookings-yet hint — only when settled (not error, not
              empty cache) and the host has zero bookings total. The
              calendar still renders below so the host sees the empty
              hour grid (which is informative — "your week is open"). */}
          {!isError && data && calendarEvents.length === 0 ? (
            <OhInlineEmpty>{t("emptyCalendarHint")}</OhInlineEmpty>
          ) : null}

          {/* Day view — works at any width, no mobile fallback needed.
              `maxBodyHeight="100%"` so the view fills its flex
              parent's remaining vertical space (B.PT296). */}
          {optimisticView === "day" ? (
            <DayView
              date={optimisticCursor}
              events={calendarEvents}
              selectedRefId={selectedUid}
              onEventClick={onEventClick}
              getHref={getEventHref}
              maxBodyHeight="100%"
            />
          ) : null}

          {/* Week view — mobile fallback to Day (B.PT144, §11 q1).
              Below md (768px), Week's 1100px min-width forces hard
              horizontal scroll on a phone — most of the week is off-
              screen and chips read as 50-60px wide. The single-day
              column is the closest "calendar feel" experience that
              fits. URL stays `?view=week`; resizing back to desktop
              renders Week again. Both branches present in the DOM;
              CSS hides one based on viewport so there's no JS swap
              and no hydration flash. (Project pattern per
              dashboard-forms.md "Breakpoint-dependent primitive
              swaps".) */}
          {optimisticView === "week" ? (
            <>
              <div className="hidden min-h-0 flex-1 md:flex md:flex-col">
                <WeekView
                  date={optimisticCursor}
                  events={calendarEvents}
                  selectedRefId={selectedUid}
                  onEventClick={onEventClick}
                  getHref={getEventHref}
                  maxBodyHeight="100%"
                />
              </div>
              <div className="md:hidden flex min-h-0 flex-1 flex-col gap-3">
                {/* Mobile week → day fallback (B.PT144) gets a
                    horizontal day-strip on top (B.PT148) so the
                    user can see + tap any day in the week without
                    going through prev/next cursor controls. The
                    cursor controls above the strip still navigate
                    by week (prev/next jump 7 days at a time per
                    the WeekView's step semantics in
                    cursor-controls.tsx). */}
                <DayStrip
                  cursorDate={optimisticCursor}
                  onDateChange={onDateChange}
                />
                <div className="flex min-h-0 flex-1 flex-col">
                  <DayView
                    date={optimisticCursor}
                    events={calendarEvents}
                    selectedRefId={selectedUid}
                    onEventClick={onEventClick}
                    getHref={getEventHref}
                    maxBodyHeight="100%"
                  />
                </div>
              </div>
            </>
          ) : null}

          {/* Month view — desktop only. On <md the `effectiveView`
              swap above coalesces ?view=month → "list" so the
              dedicated list branch (top of this component) handles
              the rendering instead of duplicating the tabs + list
              here. The hidden md:block wrapper is belt-and-braces
              against any cascade where the swap doesn't engage
              (e.g. server render). */}
          {optimisticView === "month" ? (
            <div className="hidden min-h-0 flex-1 md:flex md:flex-col">
              <MonthView
                date={optimisticCursor}
                events={calendarEvents}
                selectedRefId={selectedUid}
                onEventClick={onEventClick}
                getHref={getEventHref}
                onOverflowClick={onOverflowClick}
                getOverflowHref={getOverflowHref}
                maxBodyHeight="100%"
              />
            </div>
          ) : null}
        </div>
        </div>
        {/* DragOverlay renders the chip ghost following the pointer.
            Keeping it outside the column tree prevents the source
            chip from being unmounted/remounted while dragging
            across columns. The original chip's opacity goes to 0
            during the drag so the user only sees the overlay. */}
        <DragOverlay dropAnimation={null}>
          {activeDrag ? (
            <div className="opacity-90">
              <EventChip event={activeDrag} />
            </div>
          ) : null}
        </DragOverlay>
        </DndContext>
      ) : null}

      <BookingDetailModal uid={selectedUid} onUidChange={setSelectedUid} />

      {/* B.PT150 — confirm dialog before committing the reschedule.
          Per oh-ui.md *Destructive actions* — even a non-destructive
          mutation that's hard to undo (rebooking shifts the visitor's
          calendar invite) goes through ConfirmDialog rather than
          firing on a single drop event. The dialog is mounted at this
          level so it lives outside any view-specific tree and can
          survive view switches mid-drag (rare but possible). */}
      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) setPending(null);
        }}
        title={t("rescheduleConfirmTitle")}
        description={
          pending
            ? t("rescheduleConfirmDescription", {
                title: pending.event.title,
                from: pending.event.start.toLocaleString("en-US", {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                  hour12: true,
                }),
                to: pending.newSlotStart.toLocaleString("en-US", {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                  hour12: true,
                }),
              })
            : ""
        }
        confirmLabel={t("rescheduleConfirmLabel")}
        cancelLabel={t("rescheduleCancelLabel")}
        pending={reschedule.isPending}
        onConfirm={onConfirmReschedule}
      />
    </>
  );
}

// B.PT150 — inverse of dateIsoLocal in time-grid-column.tsx. Builds
// a Date from an ISO date string using local components so the drop
// target's column resolves to the user-local day (matches the same
// timezone discipline as `formatDateParam`).
function parseColumnDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map((s) => Number.parseInt(s, 10));
  return new Date(y, m - 1, d);
}

// Format a Date to "YYYY-MM-DD" using LOCAL components (matches the
// `parseCursorDate` helper in `page.tsx` — local-component round-
// trip avoids the UTC-offset drift that would otherwise shift the
// cursor to the previous day in negative-offset zones).
function formatDateParam(d: Date): string {
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, "0");
  const day = d.getDate().toString().padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Format the count beside the tab label.
// 0–99 → `00`, `01`, …, `99` (padded so digit width is stable across
// updates and tabular-nums keeps the rest from shimmying).
// ≥100  → `99+` (more than 99 in either tab is a long-tail edge case
// for a single-host scheduling app; clamp so the tab label doesn't
// blow out the bar's width).
function formatCount(n: number): string {
  if (n >= 100) return "99+";
  return String(n).padStart(2, "0");
}

// Label cell for the OhPillSwitcher in list-view mode.
// Renders "Upcoming 03" with the count dimmed only when the tab is
// active (matches the prior `BookingsTabBar` hierarchy: label-primary,
// count-secondary on the active tab). On inactive tabs the count
// inherits the muted parent color.
function BookingsTabLabel({
  label,
  count,
  isActive,
}: {
  label: string;
  count: number;
  isActive: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 leading-none">
      <span>{label}</span>
      <span
        className={cn(
          "tabular-nums",
          isActive ? "opacity-65" : "opacity-100",
        )}
      >
        {formatCount(count)}
      </span>
    </span>
  );
}

// Tablist with a per-tab underline that animates between tabs via
// FLIP (First, Last, Invert, Play).
//
// SSR correctness: the underline is rendered as a child of the active
// tab (conditional on `isActive`). React emits it in SSR HTML at the
// correct position via pure CSS (`absolute left:0 right:0 bottom:-5px`
// inside the trigger). Browser paints it on first frame — no JS
// measurement, no flash-of-no-bar while the bundle hydrates.
// (Earlier shared-bar version positioned the underline via gsap.set
// after hydration. The SSR HTML had width:0 → paint with no visible
// bar → JS hydrates → bar snaps in. ~500-1000ms gap on slow networks.
// Per-tab CSS positioning eliminates the gap.)
//
// Animation: when activeTab changes, the OLD underline unmounts (its
// parent trigger lost `isActive`) and the NEW underline mounts inside
// the NEW active tab at its CSS-final position. GSAP FLIP captures
// the OLD trigger's geometry (still in DOM, just not active), then
// `gsap.from()` temporarily transforms the new underline back to the
// old position + size, then animates back to identity. Net effect:
// the underline appears to slide between tabs, but the final state
// is always pure CSS — no JS measurement holds the position.
//
// References: GSAP forum topic #39455 (Next.js + Flip + SSR — "ensure
// the initial styling state of the component is correct" so first
// paint shows the final state, not a default-zero state). CSS-Tricks:
// "Animating Layouts with the FLIP Technique."
//
// Exported (B.PT118) so the dev playground at `/playground/animations/
// bookings-tabs` can render this in isolation against a controlled
// `activeTab` toggle. The FLIP refs + timeline live entirely on its
// own scope, no parent context needed.
export function BookingsTabBar({
  activeTab,
  upcomingCount,
  pastCount,
  tablistLabel,
  upcomingLabel,
  pastLabel,
}: {
  activeTab: Tab;
  upcomingCount: number;
  pastCount: number;
  tablistLabel: string;
  upcomingLabel: string;
  pastLabel: string;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const upcomingRef = useRef<HTMLButtonElement>(null);
  const pastRef = useRef<HTMLButtonElement>(null);
  // Initialize with the current tab so the first useGSAP run sees
  // prev === current and returns early — no animation on mount, the
  // SSR-rendered underline is already at the correct position.
  const prevActiveRef = useRef<Tab>(activeTab);

  useGSAP(
    () => {
      const prev = prevActiveRef.current;
      if (prev === activeTab) return;
      prevActiveRef.current = activeTab;

      const fromEl =
        prev === "upcoming" ? upcomingRef.current : pastRef.current;
      const toEl =
        activeTab === "upcoming" ? upcomingRef.current : pastRef.current;
      if (!fromEl || !toEl) return;

      const newUnderline = toEl.querySelector<HTMLSpanElement>(
        "[data-tab-underline]",
      );
      if (!newUnderline) return;

      const reduceMotion =
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reduceMotion) return;

      const fromRect = fromEl.getBoundingClientRect();
      const toRect = toEl.getBoundingClientRect();

      // FLIP the new underline from the old tab's geometry to its own
      // (CSS-final) geometry. transform-only animation — GPU-friendly,
      // doesn't trigger layout. transformOrigin: "left" so scaleX
      // grows/shrinks from the left edge instead of center.
      gsap.from(newUnderline, {
        x: fromRect.left - toRect.left,
        scaleX: fromRect.width / toRect.width,
        transformOrigin: "left center",
        duration: 0.35,
        ease: "power3.inOut",
        overwrite: true,
      });
    },
    { scope: listRef, dependencies: [activeTab] },
  );

  return (
    <TabsList
      ref={listRef}
      aria-label={tablistLabel}
      // variant="line" kills the primitive's default bg-muted fill +
      // active pill. The per-tab `::after` from the line variant is
      // hidden via after:hidden in BookingTabTrigger — our explicit
      // child <span> with [data-tab-underline] replaces it.
      variant="line"
      className="h-auto w-fit gap-4 p-0"
    >
      <BookingTabTrigger
        ref={upcomingRef}
        value="upcoming"
        count={upcomingCount}
        isActive={activeTab === "upcoming"}
      >
        {upcomingLabel}
      </BookingTabTrigger>
      {/* Hairline vertical rule — 1px, 22% ink. Drawn at the
          cap-height of the mono labels so it reads as a visual
          separator between two equal text affordances. aria-hidden
          because it's decorative; tablist keyboard nav skips it. */}
      <span
        aria-hidden
        className="inline-block h-3.5 w-px self-center bg-oh-line"
      />
      <BookingTabTrigger
        ref={pastRef}
        value="past"
        count={pastCount}
        isActive={activeTab === "past"}
      >
        {pastLabel}
      </BookingTabTrigger>
    </TabsList>
  );
}

// forwardRef so BookingsTabBar can measure each trigger's
// getBoundingClientRect for the FLIP underline animation.
const BookingTabTrigger = forwardRef<
  HTMLButtonElement,
  {
    value: Tab;
    count: number;
    isActive: boolean;
    children: React.ReactNode;
  }
>(function BookingTabTrigger({ value, count, isActive, children }, ref) {
  return (
    <TabsTrigger
      ref={ref}
      value={value}
      className={[
        // Layout: text-only trigger, no bg / border / segmented-control
        // chrome. Padding y=1 just to give the focus ring some breathing
        // room around the cap-height of the label. `after:hidden` kills
        // the line-variant's per-trigger underline pseudo — the shared
        // sliding bar (rendered by <BookingsTabBar>) replaces it.
        "group/tab inline-flex items-center gap-2 h-auto rounded-none border-0 bg-transparent p-0 py-1",
        "shadow-none data-active:shadow-none after:hidden",
        // Cursor + hit-area: the canonical "expanded hit area" pattern
        // (51bits.com/expanded-hit-areas, shadeed.ishadeed.com). Pointer
        // cursor signals "this is clickable" (Tailwind Preflight sets
        // <button> to cursor-default by default). The `::before` pseudo
        // is an invisible absolute-positioned rectangle extending 8px
        // horizontally and 16px vertically beyond the text — clicks on
        // it route to the trigger element, layout is unchanged. Clears
        // WCAG 2.5.8 (24px) and Apple HIG (44px) target sizes.
        "cursor-pointer",
        "before:content-[''] before:absolute before:-inset-x-2 before:-inset-y-4",
        // Mono caps eyebrow vocabulary, matches the rest of the chrome
        // (oh-eyebrow utility) but slightly larger (11px vs 10px) for
        // the primary tablist surface. tabular-nums on the digits so the
        // count doesn't shift columns when it updates from the SSE queue.
        "font-[family-name:var(--oh-mono)] text-[11px] font-extrabold tracking-[2px] uppercase tabular-nums",
        // Idle = subtle (35% ink); active = full ink. Opacity gap is
        // wide so the active tab visibly leads the inactive one.
        // Hover bumps inactive → full ink. Focus also bumps to ink:
        // click instantly focuses the trigger (synchronously, before
        // React commits), so when the user clicks then moves the
        // mouse out fast, focus keeps the color at ink during the
        // ~30ms commit window. Without focus, that window saw a
        // brief subtle (gray) dip — the flash the user reported.
        // After commit, data-active also gives ink, so the focus
        // rule becomes redundant and stays harmless.
        "text-[color:var(--oh-content-subtle)] data-active:text-[color:var(--oh-ink)] hover:text-[color:var(--oh-ink)] focus:text-[color:var(--oh-ink)]",
        // No transitions on the trigger. Click → text snaps instantly
        // to ink (active) / subtle (inactive); hover snaps too. The
        // sliding underline (animated via gsap in BookingsTabBar) is
        // the only motion on the tab strip — text color is binary.
        // `transition-none` is needed to override shadcn's baked-in
        // `transition-all` from tabs.tsx (line 61), which would
        // otherwise re-introduce a 150ms color fade on data-active flip.
        "transition-none",
        // B.PT105 — unified focus shadow vocabulary (oh-focus-ring class).
        "oh-focus-ring",
        // Suppress iOS Safari's grey tap highlight (same convention as
        // OhMenuTrigger — chrome-toggle pattern).
        "[-webkit-tap-highlight-color:transparent]",
      ].join(" ")}
    >
      <span className="leading-none">{children}</span>
      {/* Count is dimmed only on the ACTIVE side (label 100%, count
          65%) to keep the label-primary / count-secondary hierarchy
          when the tab is selected. Inactive: count inherits the
          parent's 35% — adding more dim there would make it vanish. */}
      <span className="leading-none group-data-[state=active]/tab:opacity-65">
        {formatCount(count)}
      </span>
      {/* Per-tab underline. Renders only when this tab is active.
          Pure CSS positioning (absolute inside the relative trigger)
          so SSR HTML paints it at the correct position on first
          frame — no JS measurement holds the position. The FLIP
          animation in BookingsTabBar transforms this element FROM
          the old tab's geometry on each tab change; CSS-final state
          is always correct. data-tab-underline is the queryable
          handle for that animation. */}
      {isActive ? (
        <span
          data-tab-underline
          aria-hidden
          className="pointer-events-none absolute bottom-[-5px] left-0 right-0 h-0.5 bg-[var(--oh-ink)]"
        />
      ) : null}
    </TabsTrigger>
  );
});

type Booking = {
  id: number;
  publicUid: string;
  visitorName: string;
  visitorEmail: string;
  question: string | null;
  slotStart: Date | string;
};

function BookingsListPanel({
  tab,
  bookings,
  onSelect,
}: {
  tab: Tab;
  bookings: Booking[];
  onSelect: (uid: string) => void;
}) {
  if (bookings.length === 0) return <EmptyBookings tab={tab} />;
  return (
    <div className="overflow-hidden rounded-(--oh-r-sm) bg-[color:var(--oh-paper)] shadow-[var(--oh-shadow-resting)]">
      <ul role="list" className="divide-y divide-oh-line">
        {bookings.map((b) => (
          <li key={b.id}>
            <BookingRow
              publicUid={b.publicUid}
              visitorName={b.visitorName}
              visitorEmail={b.visitorEmail}
              question={b.question}
              slotStart={new Date(b.slotStart as unknown as string)}
              onSelect={onSelect}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

function BookingRow({
  publicUid,
  visitorName,
  visitorEmail,
  question,
  slotStart,
  onSelect,
}: {
  publicUid: string;
  visitorName: string;
  visitorEmail: string;
  question: string | null;
  slotStart: Date;
  onSelect: (uid: string) => void;
}) {
  // B.PT26 — locale-aware date label. ICU `weekday: "short"` +
  // `month: "short"` + `day: "numeric"` produces "Mon Jul 15" / "Lun
  // jul 15" verbatim, replacing the prior hand-rolled WEEKDAY_SHORT +
  // MONTH_SHORT arrays. The oh-eyebrow class uppercases via CSS so
  // the visual rhythm is preserved.
  const format = useFormatter();
  const slotDateLabel = format.dateTime(slotStart, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  // Row trigger — the existing <Link> with click-to-open-modal
  // semantics. Wrapped in <BookingHoverPreview> below so plain
  // hover for ~500ms surfaces a compact preview without requiring
  // a click. Click still routes to the modal (or the standalone
  // page on cmd/ctrl/shift/middle-click) as before.
  const trigger = (
    <Link
      href={`/bookings/${publicUid}`}
      onClick={(e) => {
        // Plain left-click → open modal in place. Cmd/ctrl/shift/
        // middle-click fall through to the standalone page route so
        // power users can open the deep link in a new tab.
        if (
          e.defaultPrevented ||
          e.metaKey ||
          e.ctrlKey ||
          e.shiftKey ||
          e.altKey ||
          e.button !== 0
        ) {
          return;
        }
        e.preventDefault();
        onSelect(publicUid);
      }}
      className="group block px-4 py-4 transition-colors duration-150 ease-oh hover:bg-oh-tint-hover focus-visible:bg-oh-tint-hover focus-visible:outline-none"
    >
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="text-[16px] leading-[1.2] font-black truncate">
          {visitorName}
        </h3>
        <span className="oh-eyebrow tabular-nums">
          {fmtSlotTime(slotStart)}
        </span>
      </header>

      <p className="oh-eyebrow mt-2 tabular-nums">{slotDateLabel}</p>

      {question ? (
        <p className="mt-2 text-[13px] italic opacity-75 leading-relaxed">
          &ldquo;{question}&rdquo;
        </p>
      ) : null}

      <p className="mt-2 font-[family-name:var(--oh-mono)] text-[12px] tabular-nums opacity-55 truncate">
        {visitorEmail}
      </p>
    </Link>
  );

  return (
    <BookingHoverPreview
      trigger={trigger}
      visitorName={visitorName}
      visitorEmail={visitorEmail}
      question={question}
      slotStart={slotStart}
      fmtSlotTime={fmtSlotTime}
    />
  );
}

function LiveQueue() {
  const t = useTranslations("Bookings");
  const utils = trpc.useUtils();
  // Initial state: "connecting" (amber). Same architectural fix as
  // the tab underline — render the indicator at its visible state on
  // first paint via SSR HTML, no JS-deferred reveal. Earlier shape
  // started at "hidden" + setTimeout(500ms) → "connecting"; the
  // 500ms delay was meant to skip the amber flash if SSE connects
  // fast, but it cost us the dot's visibility for half a second on
  // every page load. Better: show the amber dot immediately, let
  // the SSE callbacks transition it to "live" (green) or "off"
  // (grey) when they fire. The amber→green transition is meaningful
  // ("connection just succeeded"), not noise.
  const [status, setStatus] = useState<
    "connecting" | "live" | "off"
  >("connecting");
  const [pulseKey, setPulseKey] = useState(0);

  trpc.bookings.queue.useSubscription(undefined, {
    onStarted: () => setStatus("live"),
    onError: () => setStatus("off"),
    onData: ({ data: event }) => {
      if (event.type === "created") {
        toast.success(t("toastNewBooking", { name: event.visitorName }));
      } else {
        toast(t("toastCancelled", { name: event.visitorName }));
      }
      utils.bookings.listForHost.invalidate();
      setPulseKey((k) => k + 1);
    },
  });

  return <LiveDot status={status} pulseKey={pulseKey} t={t} />;
}

function LiveDot({
  status,
  pulseKey,
  t,
}: {
  status: "connecting" | "live" | "off";
  pulseKey: number;
  t: ReturnType<typeof useTranslations<"Bookings">>;
}) {
  const tone =
    status === "live"
      ? "bg-emerald-500"
      : status === "connecting"
        ? "bg-amber-500"
        : "bg-neutral-400";
  const ariaLabel =
    status === "live"
      ? t("liveConnected")
      : status === "connecting"
        ? t("liveConnecting")
        : t("liveOff");

  return (
    <span
      key={pulseKey}
      role="status"
      aria-label={ariaLabel}
      className={[
        "oh-live-dot inline-block size-2 shrink-0 rounded-full",
        "transition-colors duration-200 ease-oh",
        tone,
      ].join(" ")}
    />
  );
}

function EmptyBookings({ tab }: { tab: Tab }) {
  const t = useTranslations("Bookings");
  const { data: me } = trpc.users.me.useQuery();

  return (
    <OhEmpty>
      <OhEmptyHeader>
        <OhEmptyMedia>
          <CalendarIcon />
        </OhEmptyMedia>
        <OhEmptyTitle>
          {tab === "upcoming" ? t("emptyUpcomingTitle") : t("emptyPastTitle")}
        </OhEmptyTitle>
        <OhEmptyDescription>
          {tab === "upcoming"
            ? t("emptyUpcomingDescription")
            : t("emptyPastDescription")}
        </OhEmptyDescription>
      </OhEmptyHeader>
      {tab === "upcoming" && me?.handle ? (
        <OhEmptyContent>
          <Link
            href={`/preview/${me.handle}`}
            // `!underline` + `!decoration-...` because globals.css line 756
            // has an unlayered `:where(.oh-root a) { text-decoration: none }`
            // shell reset. Unlayered CSS beats Tailwind's utilities layer
            // regardless of specificity (per the Cascade Layers spec).
            // The `!important` prefix reverses layer order so the layered
            // utilities win — same gotcha called out in dashboard-forms.md
            // *Hover + color contracts*.
            //
            // Both text + underline use `--oh-content-muted` (~55% ink) at
            // rest so the link reads as the tertiary-quiet affordance the
            // empty state intends — visible enough to act on, quiet enough
            // not to compete with the title/icon. Hover lifts both to full
            // ink (the standard tertiary dashboard pattern).
            className="oh-focus-ring text-[13px] font-medium text-[color:var(--oh-content-muted)] !underline !underline-offset-4 !decoration-[1.5px] !decoration-[color:var(--oh-content-muted)] transition-colors hover:text-[color:var(--oh-ink)] hover:!decoration-[color:var(--oh-ink)]"
          >
            {t("emptyCta")}
          </Link>
        </OhEmptyContent>
      ) : null}
    </OhEmpty>
  );
}

export { MailIcon };

function fmtSlotTime(d: Date): string {
  const hour24 = d.getHours();
  const hour12 = ((hour24 + 11) % 12) + 1;
  const suffix = hour24 < 12 ? "AM" : "PM";
  const minute = String(d.getMinutes()).padStart(2, "0");
  return `${hour12}:${minute} ${suffix}`;
}
