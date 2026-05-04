"use client";

import { forwardRef, useMemo, useRef, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Link } from "next-view-transitions";
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
import { OnboardingChecklist } from "@/components/oh/onboarding-checklist";
import {
  Tabs,
  TabsContent,
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
  const router = useRouter();
  const { data, isError, error } = trpc.bookings.listForHost.useQuery();
  const { data: flags } = trpc.users.featureFlags.useQuery();
  const { data: scheduleRanges } = trpc.schedule.get.useQuery();
  const liveQueueEnabled = flags?.["live-queue"] ?? false;

  const [selectedUid, setSelectedUid] = useState<string | null>(null);

  const [activeDrag, setActiveDrag] = useState<CalendarEvent | null>(null);
  const [pending, setPending] = useState<{
    event: CalendarEvent;
    newSlotStart: Date;
    durationMin: number;
  } | null>(null);

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

  const onViewChange = (next: ViewMode) => {
    if (next === activeView) return;
    const params = new URLSearchParams();
    params.set("view", next);
    if (next === "list") {
      params.set("tab", activeTab);
    } else {
      params.set("date", formatDateParam(cursorDate));
    }
    router.push(`?${params.toString()}`, { scroll: false });
  };

  const onDateChange = (next: Date) => {
    const params = new URLSearchParams();
    params.set("view", activeView);
    params.set("date", formatDateParam(next));
    router.push(`?${params.toString()}`, { scroll: false });
  };

  const onEventClick = (event: CalendarEvent) => {
    if (event.refId) setSelectedUid(event.refId);
  };

  const onDragStart = (e: DragStartEvent) => {
    const data = e.active.data.current as DraggableEventDragData | undefined;
    if (!data || data.type !== "event") return;
    const ev = calendarEvents.find((c) => (c.refId ?? c.id) === data.refId);
    if (ev) setActiveDrag(ev);
  };

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

    const sourceStart = new Date(dragData.startMs);
    const sourceTopPx =
      ((sourceStart.getHours() - startHour) * 60 + sourceStart.getMinutes()) *
      oneMinuteHeightPx;
    const newTopPx = snapPixelToGrid(sourceTopPx + delta.y, {
      oneMinuteHeightPx,
      stepMinutes: 15,
    });
    const newSlotStart = pixelToTime(newTopPx, targetDate, {
      startHour,
      oneMinuteHeightPx,
    });

    if (newSlotStart.getTime() === sourceEvent.start.getTime()) return;

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

  const getEventHref = (event: CalendarEvent) =>
    event.refId ? `/bookings/${event.refId}` : "#";

  const onOverflowClick = (date: Date) => {
    const params = new URLSearchParams();
    params.set("view", "day");
    params.set("date", formatDateParam(date));
    router.push(`?${params.toString()}`, { scroll: false });
  };
  const getOverflowHref = (date: Date) =>
    `/bookings?view=day&date=${formatDateParam(date)}`;

  const calendarMaxWidthClass = (() => {
    switch (activeView) {
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

  return (
    <>
      <OhPageShell>
        <OhPageHeader
          title={t("title")}
          aside={liveQueueEnabled ? <LiveQueue /> : null}
        />

        <OnboardingChecklist />

        <div className="mt-8">
          <BookingsViewSwitcher
            value={activeView}
            onValueChange={onViewChange}
          />
        </div>
      </OhPageShell>

      {activeView === "list" ? (
        <OhPageShell>
          <Tabs
            value={activeTab}
            onValueChange={(value) => {
              if (value === activeTab) return;
              if (!VALID_TABS.includes(value as Tab)) return;
              router.push(`?view=list&tab=${value}`, { scroll: false });
            }}
          >
            <BookingsTabBar
              activeTab={activeTab}
              upcomingCount={data?.upcoming.length ?? 0}
              pastCount={data?.past.length ?? 0}
              tablistLabel={t("tablistLabel")}
              upcomingLabel={t("tabUpcoming")}
              pastLabel={t("tabPast")}
            />

            <TabsContent value="upcoming" className="mt-6">
              <BookingsListPanel
                tab="upcoming"
                bookings={data?.upcoming ?? []}
                onSelect={setSelectedUid}
              />
            </TabsContent>
            <TabsContent value="past" className="mt-6">
              <BookingsListPanel
                tab="past"
                bookings={data?.past ?? []}
                onSelect={setSelectedUid}
              />
            </TabsContent>
          </Tabs>
        </OhPageShell>
      ) : (
        <DndContext
          sensors={sensors}
          modifiers={[restrictToFirstScrollableAncestor]}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          onDragCancel={() => setActiveDrag(null)}
        >
        <div
          className={cn(
            "mx-auto w-full px-4 pb-8 sm:px-6 sm:pb-10 flex flex-col gap-4",
            calendarMaxWidthClass,
          )}
        >
          <BookingsCursorControls
            view={activeView}
            cursorDate={cursorDate}
            onDateChange={onDateChange}
          />

          {isError ? (
            <OhInlineEmpty>
              {t("errorLoading")}
              {error?.message ? ` — ${error.message}` : null}
            </OhInlineEmpty>
          ) : null}

          {!isError && data && calendarEvents.length === 0 ? (
            <OhInlineEmpty>{t("emptyCalendarHint")}</OhInlineEmpty>
          ) : null}

          {activeView === "day" ? (
            <DayView
              date={cursorDate}
              events={calendarEvents}
              selectedRefId={selectedUid}
              onEventClick={onEventClick}
              getHref={getEventHref}
            />
          ) : null}

          {activeView === "week" ? (
            <>
              <div className="hidden md:block">
                <WeekView
                  date={cursorDate}
                  events={calendarEvents}
                  selectedRefId={selectedUid}
                  onEventClick={onEventClick}
                  getHref={getEventHref}
                />
              </div>
              <div className="md:hidden flex flex-col gap-3">
                <DayStrip
                  cursorDate={cursorDate}
                  onDateChange={onDateChange}
                />
                <DayView
                  date={cursorDate}
                  events={calendarEvents}
                  selectedRefId={selectedUid}
                  onEventClick={onEventClick}
                  getHref={getEventHref}
                />
              </div>
            </>
          ) : null}

          {activeView === "month" ? (
            <>
              <div className="hidden md:block">
                <MonthView
                  date={cursorDate}
                  events={calendarEvents}
                  selectedRefId={selectedUid}
                  onEventClick={onEventClick}
                  getHref={getEventHref}
                  onOverflowClick={onOverflowClick}
                  getOverflowHref={getOverflowHref}
                />
              </div>
              <div className="md:hidden">
                <Tabs
                  value={activeTab}
                  onValueChange={(value) => {
                    if (value === activeTab) return;
                    if (!VALID_TABS.includes(value as Tab)) return;
                    router.push(`?view=list&tab=${value}`, {
                      scroll: false,
                    });
                  }}
                >
                  <BookingsTabBar
                    activeTab={activeTab}
                    upcomingCount={data?.upcoming.length ?? 0}
                    pastCount={data?.past.length ?? 0}
                    tablistLabel={t("tablistLabel")}
                    upcomingLabel={t("tabUpcoming")}
                    pastLabel={t("tabPast")}
                  />
                  <TabsContent value="upcoming" className="mt-6">
                    <BookingsListPanel
                      tab="upcoming"
                      bookings={data?.upcoming ?? []}
                      onSelect={setSelectedUid}
                    />
                  </TabsContent>
                  <TabsContent value="past" className="mt-6">
                    <BookingsListPanel
                      tab="past"
                      bookings={data?.past ?? []}
                      onSelect={setSelectedUid}
                    />
                  </TabsContent>
                </Tabs>
              </div>
            </>
          ) : null}
        </div>
        <DragOverlay dropAnimation={null}>
          {activeDrag ? (
            <div className="opacity-90">
              <EventChip event={activeDrag} />
            </div>
          ) : null}
        </DragOverlay>
        </DndContext>
      )}

      <BookingDetailModal uid={selectedUid} onUidChange={setSelectedUid} />

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

function parseColumnDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map((s) => Number.parseInt(s, 10));
  return new Date(y, m - 1, d);
}

function formatDateParam(d: Date): string {
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, "0");
  const day = d.getDate().toString().padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatCount(n: number): string {
  if (n >= 100) return "99+";
  return String(n).padStart(2, "0");
}

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
        "group/tab inline-flex items-center gap-2 h-auto rounded-none border-0 bg-transparent p-0 py-1",
        "shadow-none data-active:shadow-none after:hidden",
        "cursor-pointer",
        "before:content-[''] before:absolute before:-inset-x-2 before:-inset-y-4",
        "font-[family-name:var(--oh-mono)] text-[11px] font-extrabold tracking-[2px] uppercase tabular-nums",
        "text-[color:var(--oh-content-subtle)] data-active:text-[color:var(--oh-ink)] hover:text-[color:var(--oh-ink)] focus:text-[color:var(--oh-ink)]",
        "transition-none",
        "oh-focus-ring",
        "[-webkit-tap-highlight-color:transparent]",
      ].join(" ")}
    >
      <span className="leading-none">{children}</span>
      <span className="leading-none group-data-[state=active]/tab:opacity-65">
        {formatCount(count)}
      </span>
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
    <ul
      role="list"
      className="divide-y divide-oh-line"
    >
      {bookings.map((b) => (
        <li
          key={b.id}
          className="[&:only-child]:border-b [&:only-child]:border-oh-line"
        >
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
  const format = useFormatter();
  const slotDateLabel = format.dateTime(slotStart, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  return (
    <Link
      href={`/bookings/${publicUid}`}
      onClick={(e) => {
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
          “{question}”
        </p>
      ) : null}

      <p className="mt-2 font-[family-name:var(--oh-mono)] text-[12px] tabular-nums opacity-55 truncate">
        {visitorEmail}
      </p>
    </Link>
  );
}

function LiveQueue() {
  const t = useTranslations("Bookings");
  const utils = trpc.useUtils();
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
