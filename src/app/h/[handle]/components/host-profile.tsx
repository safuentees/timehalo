"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
  type ComponentProps,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2 } from "lucide-react";
import { flushSync } from "react-dom";
import { usePathname } from "next/navigation";
import { useMounted } from "@/hooks/use-mounted";
import { useTranslations } from "next-intl";
import type { inferRouterOutputs } from "@trpc/server";
import { keepPreviousData } from "@tanstack/react-query";
import { trpc } from "@/trpc/hooks";
import type { AppRouter } from "@/trpc/router";
import { AnimatePresence, motion } from "motion/react";
import { OhVisitorShell } from "@/components/oh/oh-visitor-shell";
import {
  HANDLE_AVATAR_PROJECTION_STYLE,
  HandleHostAvatarBody,
} from "./handle-host-avatar";
import { isOpenSlot, toKey, type Slot } from "@/lib/availability";
import {
  getQueryParam,
  updateQueryParam,
  updateQueryParams,
} from "@/lib/url-params";
import { cn } from "@/lib/utils";
import { HandleModal } from "./handle-modal";
import {
  oStyle,
  useModalDebug,
  zStyle,
} from "../_components/visitor-debug-overlay";
import animSpec from "@/../docs/figma/anim-h-handle-redesign.json";
import { HandleMorphCard } from "./handle-morph-card";
import {
  FALLBACK_SLOT_OPTIONS,
  HANDLE_CARD_RADIUS_STYLE,
  HANDLE_SLOT_CONCENTRIC_OUTER_RADIUS,
  HANDLE_SLOT_LIST_RADIUS_STYLE,
  SlotRow,
  cornerRadiusStyle,
  minutesToSlotOption,
  type SlotOption,
} from "./handle-morph-parts";

const OPEN_SPRING = {
  mass: 1,
  stiffness: 400,
  damping: 35,
  velocity: 0,
} as const;
const CLOSE_SPRING =
  animSpec.transitions.find(
    (t) => t.from?.name === "handle-detail" && t.to?.name === "handle",
  )?.spring ?? animSpec.transitions[2].spring;

type RouterOutputs = inferRouterOutputs<AppRouter>;

type Props = {
  handle: string;
  initialUser: RouterOutputs["users"]["getByHandle"];
  initialSlots: RouterOutputs["schedule"]["getUpcomingSlots"];
  renderedAt: string;
  isOwner?: boolean;
};

export default function HostProfile({
  handle,
  initialUser,
  initialSlots,
  renderedAt,
  isOwner = false,
}: Props) {
  const t = useTranslations("HostProfile");
  const pathname = usePathname();
  const { values: debugValues } = useModalDebug();
  const zL1 = debugValues?.zLayer1;
  const oL1 = debugValues?.oLayer1;
  const openSpring = debugValues?.openSpring ?? OPEN_SPRING;
  const closeSpring = debugValues?.closeSpring ?? CLOSE_SPRING;
  const keepLandingMounted = debugValues?.keepLandingMounted ?? false;
  const mounted = useMounted();
  const { data: fetchedUser } = trpc.users.getByHandle.useQuery(
    { handle },
    {
      initialData: initialUser,
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000,
    },
  );
  const [selectedDurationLabel, setSelectedDurationLabel] = useState<
    string | undefined
  >(undefined);
  const [selectedDurationMinutes, setSelectedDurationMinutes] = useState<
    number | undefined
  >(undefined);
  const fetchedSlotsResult = trpc.schedule.getUpcomingSlots.useQuery(
    {
      handle,
      durationMinutes: selectedDurationMinutes,
    },
    {
      initialData:
        selectedDurationMinutes === undefined ? initialSlots : undefined,
      placeholderData: keepPreviousData,
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000,
    },
  );
  const user = fetchedUser ?? initialUser;
  const slots = fetchedSlotsResult.data ?? initialSlots;
  const slotsFetchingFresh =
    fetchedSlotsResult.isFetching && fetchedSlotsResult.isPlaceholderData;
  const [, startTransition] = useTransition();
  const router = useRouter();

  const visitorHeaderRef = useRef<HTMLDivElement>(null);

  const utils = trpc.useUtils();
  useEffect(() => {
    if (!user.durationChoices || user.durationChoices.length <= 1) return;
    void Promise.resolve().then(() => {
      for (const choice of user.durationChoices) {
        if (choice.minutes === user.defaultDurationMinutes) continue;
        void utils.schedule.getUpcomingSlots.prefetch({
          handle,
          durationMinutes: choice.minutes,
        });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const now = new Date(renderedAt);
  const availableSlots = slots.filter(isOpenSlot);
  const nextSlot = availableSlots[0];
  const visitorTz = useVisitorTz();
  const openToday = availableSlots.some((s) => isToday(new Date(s.start), now));
  const daysWithOpenSlotsThisWeek = countOpenDaysThisWeek(availableSlots, now);

  const [drawerOpen, setDrawerOpenRaw] = useState(false);
  const [receiptTransitionPending, setReceiptTransitionPending] =
    useState(false);
  const exitInFlightRef = useRef(false);
  const pendingOpenRef = useRef(false);
  const setDrawerOpen = (next: boolean) => {
    if (exitInFlightRef.current && next) {
      pendingOpenRef.current = true;
      return;
    }
    if (drawerOpen && !next) exitInFlightRef.current = true;
    setDrawerOpenRaw(next);
  };

  const slotOptions: ReadonlyArray<SlotOption> =
    initialUser.durationChoices.length > 0
      ? initialUser.durationChoices.map((m) => minutesToSlotOption(m, t))
      : FALLBACK_SLOT_OPTIONS;
  const receiptRouteActive = pathname.includes(`/h/${handle}/booked/`);
  const receiptOverlayActive = receiptRouteActive || receiptTransitionPending;
  useEffect(() => {
    if (!receiptRouteActive) setReceiptTransitionPending(false);
  }, [receiptRouteActive]);
  const stripLandingLayoutId =
    mounted && ((keepLandingMounted && drawerOpen) || receiptOverlayActive);
  const landingLayoutId = (id: string) =>
    stripLandingLayoutId ? undefined : id;
  const identityProjectionTransition = {
    type: "spring",
    ...(drawerOpen ? openSpring : closeSpring),
  } satisfies ComponentProps<typeof motion.div>["transition"];

  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const [selectedSlot, setSelectedSlot] = useState<Slot | undefined>();
  const searchParams = useSearchParams();
  const rescheduleFromUid = searchParams.get("reschedule") ?? undefined;

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const lastRescheduleUidRef = useRef<string | undefined>(undefined);
  useLayoutEffect(() => {
    if (
      rescheduleFromUid &&
      rescheduleFromUid !== lastRescheduleUidRef.current &&
      !drawerOpen
    ) {
      setDrawerOpen(true);
    }
    if (
      !rescheduleFromUid &&
      lastRescheduleUidRef.current &&
      drawerOpen
    ) {
      setDrawerOpen(false);
    }
    lastRescheduleUidRef.current = rescheduleFromUid;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rescheduleFromUid]);

  useEffect(() => {
    function handlePop() {
      const dateStr = getQueryParam("date");
      const slotIso = getQueryParam("slot");
      const apply = () =>
        flushSync(() => {
          setSelectedDate(
            dateStr ? (parseDateKey(dateStr) ?? undefined) : undefined,
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

  const wasOpenRef = useRef(false);
  useEffect(() => {
    if (drawerOpen && !wasOpenRef.current) {
      setSelectedSlot(undefined);
      updateQueryParam("slot", null, { pushEntry: false });
    }
    wasOpenRef.current = drawerOpen;
  }, [drawerOpen]);

  const displayName = user.displayLabel ?? user.handle ?? "Host";
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
    <OhVisitorShell
      className="[--oh-ink:#0a0a0a] [--oh-paper:#eee7d5] dark:[--oh-ink:#ede4cf] dark:[--oh-paper:#1a1a1a]"
      headerClassName="z-[60]"
      headerRef={visitorHeaderRef}
      header={
        <div className="flex w-full flex-col gap-3">
          <div className="mx-auto flex w-full max-w-[760px] items-center justify-between gap-3 px-0">
            <div className="flex items-center gap-2">
              {isOwner ? (
                <Link
                  href="/bookings"
                  aria-label="Back to dashboard"
                  title="Back to dashboard"
                  className="oh-focus-ring relative z-[100] inline-flex size-5 shrink-0 items-center justify-center rounded-(--oh-r-xs) text-[color:var(--oh-ink)] opacity-55 transition-opacity duration-150 ease-oh hover:opacity-100"
                >
                  <ArrowLeft
                    aria-hidden
                    strokeWidth={2.25}
                    className="size-3.5"
                  />
                </Link>
              ) : null}
              <span className="oh-eyebrow tabular-nums opacity-100">
                /h/{user.handle}
              </span>
            </div>
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
          {rescheduleFromUid ? (
            <div
              role="status"
              className="mx-auto flex w-full max-w-[760px] items-center justify-between gap-3 border-t border-oh-line pt-3"
            >
              <div className="flex items-center gap-2">
                <span
                  aria-hidden
                  className="size-1.5 shrink-0 rounded-full bg-amber-500"
                />
                <span className="oh-eyebrow truncate opacity-100">
                  {t("rescheduling")}
                </span>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  router.push(
                    `/h/${user.handle}/booked/${rescheduleFromUid}`,
                  );
                }}
                className="oh-focus-ring oh-eyebrow shrink-0 rounded-(--oh-r-xs) opacity-55 transition-opacity hover:opacity-100"
              >
                {t("cancel")}
              </button>
            </div>
          ) : null}
        </div>
      }
    >

          <AnimatePresence mode="popLayout">
            {!drawerOpen || keepLandingMounted ? (
              <HandleMorphCard
                key="landing-card"
                layoutId={landingLayoutId("handle-card")}
                layoutCrossfade={false}
                transition={{
                  type: "spring",
                  ...(drawerOpen ? openSpring : closeSpring),
                }}
                initial={{
                  ...HANDLE_CARD_RADIUS_STYLE,
                  opacity: oStyle(oL1?.layer, 1),
                }}
                animate={{
                  ...HANDLE_CARD_RADIUS_STYLE,
                  opacity: oStyle(oL1?.layer, 1),
                }}
                exit={{
                  ...HANDLE_CARD_RADIUS_STYLE,
                  opacity: oStyle(oL1?.layer, 1),
                }}
                style={{
                  position: zL1?.layer ? "relative" : undefined,
                  zIndex: zStyle(zL1?.layer),
                }}
                aria-label={t("landingCardAria", { name: displayName })}
                className={cn(
                  "max-w-[385px] gap-[10px] p-[15px]",
                )}
              >
                <motion.header
                  layoutId={landingLayoutId("oh-identity")}
                  transition={identityProjectionTransition}
                  initial={{ opacity: oStyle(oL1?.identity, 1) }}
                  animate={{ opacity: oStyle(oL1?.identity, 1) }}
                  exit={{ opacity: 0 }}
                  style={{
                    visibility: stripLandingLayoutId ? "hidden" : undefined,
                    zIndex: zStyle(zL1?.identity),
                    containerType: "inline-size",
                  }}
                  className="mx-auto flex w-[336px] max-w-full flex-col gap-3"
                >
                  <motion.div
                    layoutId={landingLayoutId("oh-identity-row")}
                    layout
                    transition={identityProjectionTransition}
                    initial={{ opacity: 1 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 1 }}
                    className="flex min-w-0 items-center gap-3"
                  >
                    <motion.span
                      layoutId={landingLayoutId("oh-identity-avatar")}
                      layout="position"
                      transition={identityProjectionTransition}
                      initial={{ opacity: 1 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 1 }}
                      style={HANDLE_AVATAR_PROJECTION_STYLE}
                      className="relative inline-flex size-[55px] shrink-0"
                    >
                      <HandleHostAvatarBody
                        src={user.image}
                        alt={displayName}
                        initials={initials}
                      />
                    </motion.span>
                    <motion.h1
                      layoutId={landingLayoutId("oh-identity-title")}
                      layout="position"
                      transition={identityProjectionTransition}
                      initial={{ opacity: 1 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 1 }}
                      className="min-w-0 break-words text-balance font-sans text-[clamp(22px,11cqi,52px)] font-bold leading-[1.06] tracking-[-0.04em] [overflow-wrap:anywhere]"
                    >
                      {displayName}
                    </motion.h1>
                  </motion.div>
                  <motion.p
                    layout="position"
                    transition={identityProjectionTransition}
                    className="oh-description text-center"
                  >
                    {user.bio ?? t("defaultBio")}
                  </motion.p>
                </motion.header>

                <motion.div
                  layoutId={landingLayoutId("oh-slot-list")}
                  transition={{
                    type: "spring",
                    ...(drawerOpen ? openSpring : closeSpring),
                  }}
                  initial={{
                    ...HANDLE_SLOT_LIST_RADIUS_STYLE,
                    opacity: oStyle(oL1?.slotList, 1),
                  }}
                  animate={{
                    ...HANDLE_SLOT_LIST_RADIUS_STYLE,
                    opacity: oStyle(oL1?.slotList, 1),
                  }}
                  exit={{
                    ...HANDLE_SLOT_LIST_RADIUS_STYLE,
                    opacity: 0,
                  }}
                  style={{
                    ...HANDLE_SLOT_LIST_RADIUS_STYLE,
                    boxShadow: "inset 0 0 4px rgba(0,0,0,0.25)",
                    zIndex: zStyle(zL1?.slotList),
                  }}
                  className={cn(
                    "relative flex flex-col gap-2.5",
                    "bg-[#F5EFDF] dark:bg-[#272727]",
                  )}
                >
                  {slotOptions.length === 0 ? (
                    <p className="oh-description p-6 text-center">
                      {t("emptyNoDurationsDescription")}
                    </p>
                  ) : hasOpenSlots ? (
                    <motion.ul
                      layoutId={landingLayoutId("oh-slot-stack")}
                      transition={{
                        type: "spring",
                        ...(drawerOpen ? openSpring : closeSpring),
                      }}
                      style={{ boxShadow: "none" }}
                      className="flex flex-col gap-2.5 p-[15px]"
                    >
                      {slotOptions.map((opt, i) => {
                        const slotRadiusStyle = cornerRadiusStyle(
                          HANDLE_SLOT_CONCENTRIC_OUTER_RADIUS,
                        );
                        return (
                          <li key={opt.label}>
                            <SlotRow
                              layoutId={landingLayoutId(`oh-slot-${i}`)}
                              transition={{
                                type: "spring",
                                ...(drawerOpen ? openSpring : closeSpring),
                              }}
                              initial={{
                                ...slotRadiusStyle,
                                opacity: oStyle(
                                  oL1
                                    ? [
                                        oL1.slot0,
                                        oL1.slot1,
                                        oL1.slot2,
                                        oL1.slot3,
                                      ][i]
                                    : undefined,
                                  1,
                                ),
                              }}
                              animate={{
                                ...slotRadiusStyle,
                                opacity: oStyle(
                                  oL1
                                    ? [
                                        oL1.slot0,
                                        oL1.slot1,
                                        oL1.slot2,
                                        oL1.slot3,
                                      ][i]
                                    : undefined,
                                  1,
                                ),
                              }}
                              exit={{
                                ...slotRadiusStyle,
                                opacity: oStyle(
                                  oL1
                                    ? [
                                        oL1.slot0,
                                        oL1.slot1,
                                        oL1.slot2,
                                        oL1.slot3,
                                      ][i]
                                    : undefined,
                                  1,
                                ),
                              }}
                              style={{
                                position: zL1 ? "relative" : undefined,
                                zIndex: zStyle(
                                  zL1
                                    ? [
                                        zL1.slot0,
                                        zL1.slot1,
                                        zL1.slot2,
                                        zL1.slot3,
                                      ][i]
                                    : undefined,
                                ),
                              }}
                              figmaLayer={`landing-slot-${i}`}
                              title={opt.title ?? opt.fullLabel}
                              description={opt.description ?? ""}
                              durationLabel={opt.label}
                              onClick={() => {
                                router.prefetch(`/h/${handle}/booked`);
                                startTransition(() => {
                                  setSelectedDurationLabel(opt.fullLabel);
                                  setSelectedDurationMinutes(opt.minutes);
                                });
                                setDrawerOpen(true);
                              }}
                            />
                          </li>
                        );
                      })}
                    </motion.ul>
                  ) : (
                    <p className="oh-description py-6 text-center">
                      {!hasSlots
                        ? t("emptyClosedDescription", { name: displayName })
                        : t("emptyBookedDescription", { name: displayName })}
                    </p>
                  )}
                  {slotsFetchingFresh ? (
                    <div
                      className="pointer-events-none absolute inset-0 flex items-center justify-center"
                      aria-live="polite"
                      aria-busy="true"
                    >
                      <span className="rounded-full bg-[var(--oh-paper)] p-2 shadow-[var(--oh-shadow-resting)]">
                        <Loader2
                          aria-hidden
                          strokeWidth={1.75}
                          className="size-4 animate-spin opacity-65"
                        />
                      </span>
                    </div>
                  ) : null}
                </motion.div>
              </HandleMorphCard>
            ) : null}
          </AnimatePresence>

          <span className="sr-only" aria-hidden>
            {visitorTz} {daysWithOpenSlotsThisWeek} {nextSlot?.start ?? ""}
          </span>

          <AnimatePresence
            mode="popLayout"
            onExitComplete={() => {
              exitInFlightRef.current = false;
              if (pendingOpenRef.current) {
                pendingOpenRef.current = false;
                setDrawerOpenRaw(true);
              }
            }}
          >
            {hasOpenSlots && drawerOpen && !receiptOverlayActive ? (
              <HandleModal
                key="handle-modal"
                handle={handle}
                slots={slots}
                open
                extraShards={[visitorHeaderRef]}
                bookingHorizonDays={user.bookingHorizonDays}
                onOpenChange={(next) => {
                  if (!next && rescheduleFromUid) {
                    router.push(
                      `/h/${user.handle}/booked/${rescheduleFromUid}`,
                    );
                    return;
                  }
                  setDrawerOpen(next);
                }}
                selectedDate={selectedDate}
                onSelectDate={handleSelectDate}
                selectedSlot={selectedSlot}
                rescheduleFromUid={rescheduleFromUid}
                durationLabel={selectedDurationLabel}
                durationMinutes={selectedDurationMinutes}
                onPickSlot={(s) => {
                  setSelectedSlot(s);
                  updateQueryParam("slot", s.start, { pushEntry: true });
                }}
                onBookingComplete={() => {
                  setReceiptTransitionPending(true);
                  setDrawerOpen(false);
                }}
                identityContent={
                  <motion.div
                    layoutId="oh-identity-row"
                    layout
                    transition={identityProjectionTransition}
                    initial={{ opacity: 1 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 1 }}
                    className="flex min-w-0 items-center gap-3"
                    style={{ containerType: "inline-size" }}
                  >
                    <motion.span
                      layoutId="oh-identity-avatar"
                      layout="position"
                      transition={identityProjectionTransition}
                      initial={{ opacity: 1 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 1 }}
                      style={HANDLE_AVATAR_PROJECTION_STYLE}
                      className="relative inline-flex size-[55px] shrink-0"
                    >
                      <HandleHostAvatarBody
                        src={user.image}
                        alt={displayName}
                        initials={initials}
                      />
                    </motion.span>
                    <motion.h1
                      layoutId="oh-identity-title"
                      layout="position"
                      transition={identityProjectionTransition}
                      initial={{ opacity: 1 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 1 }}
                      className="min-w-0 break-words text-balance font-sans text-[clamp(22px,11cqi,52px)] font-bold leading-[1.06] tracking-[-0.04em] [overflow-wrap:anywhere]"
                    >
                      {displayName}
                    </motion.h1>
                  </motion.div>
                }
              />
            ) : null}
          </AnimatePresence>
    </OhVisitorShell>
  );
}

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
