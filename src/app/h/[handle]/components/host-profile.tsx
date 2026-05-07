"use client";

import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ComponentProps,
} from "react";
import { flushSync } from "react-dom";
import { usePathname } from "next/navigation";
import { useMounted } from "@/hooks/use-mounted";
import { useTranslations } from "next-intl";
import type { inferRouterOutputs } from "@trpc/server";
import { trpc } from "@/trpc/hooks";
import type { AppRouter } from "@/trpc/router";
import { AnimatePresence, motion } from "motion/react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { OhVisitorShell } from "@/components/oh/oh-visitor-shell";
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
  HANDLE_CARD_RADIUS_STYLE,
  HANDLE_SLOT_CONCENTRIC_OUTER_RADIUS,
  HANDLE_SLOT_LIST_RADIUS_STYLE,
  SLOT_OPTIONS,
  SlotRow,
  cornerRadiusStyle,
} from "./handle-morph-parts";

const OPEN_SPRING = animSpec.transitions[0].spring;
const CLOSE_SPRING =
  animSpec.transitions.find(
    (t) => t.from?.name === "handle-detail" && t.to?.name === "handle",
  )?.spring ?? animSpec.transitions[2].spring;

const HANDLE_AVATAR_PROJECTION_STYLE = {
  borderRadius: 9999,
  boxShadow: "0 4px 4px rgba(0,0,0,0.25)",
} satisfies CSSProperties;

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
  const [selectedDurationLabel, setSelectedDurationLabel] = useState<
    string | undefined
  >(undefined);
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
    <OhVisitorShell
      className="[--oh-ink:#0a0a0a] [--oh-paper:#eee7d5]"
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

          <AnimatePresence mode="popLayout">
            {!drawerOpen || keepLandingMounted ? (
              <HandleMorphCard
                key="landing-card"
                layoutId={landingLayoutId("handle-card")}
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
                    className="flex items-center gap-3"
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
                      <Avatar className="size-[55px]">
                        <AvatarImage
                          src={user.image ?? undefined}
                          alt={displayName}
                        />
                        <AvatarFallback className="size-[55px] bg-[color:var(--oh-tint)] font-[family-name:var(--oh-mono)] text-[11px] font-extrabold uppercase tracking-[1px]">
                          {initials}
                        </AvatarFallback>
                      </Avatar>
                      <span
                        aria-hidden
                        className="pointer-events-none absolute inset-0 rounded-full ring-1 ring-[#E5E5E5]"
                      />
                    </motion.span>
                    <motion.h1
                      layoutId={landingLayoutId("oh-identity-title")}
                      layout="position"
                      transition={identityProjectionTransition}
                      initial={{ opacity: 1 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 1 }}
                      className="font-sans text-[clamp(32px,1rem+4vw,52px)] font-bold leading-[1.06] tracking-[-1.3px]"
                    >
                      {displayName}
                    </motion.h1>
                  </motion.div>
                  <motion.p
                    layout="position"
                    transition={identityProjectionTransition}
                    className="oh-description text-center"
                  >
                    {t("defaultBio")}
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
                    "flex flex-col gap-2.5",
                    "bg-[#F5EFDF]",
                  )}
                >
                  {hasOpenSlots ? (
                    <motion.ul
                      layoutId={landingLayoutId("oh-slot-stack")}
                      transition={{
                        type: "spring",
                        ...(drawerOpen ? openSpring : closeSpring),
                      }}
                      style={{ boxShadow: "none" }}
                      className="flex flex-col gap-2.5 p-[15px]"
                    >
                      {SLOT_OPTIONS.map((opt, i) => {
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
                              title="intro"
                              description="quick chat, voice only"
                              durationLabel={opt.label}
                              onClick={() => {
                                setSelectedDurationLabel(opt.fullLabel);
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
                onOpenChange={setDrawerOpen}
                selectedDate={selectedDate}
                onSelectDate={handleSelectDate}
                selectedSlot={selectedSlot}
                rescheduleFromUid={rescheduleFromUid}
                durationLabel={selectedDurationLabel}
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
                    className="flex items-center gap-3"
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
                      <Avatar className="size-[55px]">
                        <AvatarImage
                          src={user.image ?? undefined}
                          alt={displayName}
                        />
                        <AvatarFallback className="size-[55px] bg-[color:var(--oh-tint)] font-[family-name:var(--oh-mono)] text-[11px] font-extrabold uppercase tracking-[1px]">
                          {initials}
                        </AvatarFallback>
                      </Avatar>
                      <span
                        aria-hidden
                        className="pointer-events-none absolute inset-0 rounded-full ring-1 ring-[#E5E5E5]"
                      />
                    </motion.span>
                    <motion.h1
                      layoutId="oh-identity-title"
                      layout="position"
                      transition={identityProjectionTransition}
                      initial={{ opacity: 1 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 1 }}
                      className="font-sans text-[clamp(32px,1rem+4vw,52px)] font-bold leading-[1.06] tracking-[-1.3px]"
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
