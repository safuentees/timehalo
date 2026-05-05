"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { flushSync } from "react-dom";
import { useMounted } from "@/hooks/use-mounted";
import { useTranslations } from "next-intl";
import type { inferRouterOutputs } from "@trpc/server";
import { trpc } from "@/trpc/hooks";
import type { AppRouter } from "@/trpc/router";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
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

const OPEN_SPRING = animSpec.transitions[0].spring;
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
};

export default function HostProfile({
  handle,
  initialUser,
  initialSlots,
  renderedAt,
}: Props) {
  const t = useTranslations("HostProfile");
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
  const daysWithOpenSlotsThisWeek = countOpenDaysThisWeek(
    availableSlots,
    now,
  );

  const [drawerOpen, setDrawerOpen] = useState(false);
  const stripLandingLayoutId = mounted && keepLandingMounted && drawerOpen;
  const landingLayoutId = (id: string) =>
    stripLandingLayoutId ? undefined : id;

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

      <LayoutGroup>
      <div className="flex w-full justify-center px-4 py-10 sm:py-14">
        <AnimatePresence mode="popLayout">
          {!drawerOpen || keepLandingMounted ? (
            <motion.article
              key="landing-card"
              layoutId={landingLayoutId("handle-card")}
              transition={{ type: "spring", ...(drawerOpen ? openSpring : closeSpring) }}
              animate={{ opacity: oStyle(oL1?.layer, 1) }}
              exit={{ opacity: oStyle(oL1?.layer, 1) }}
              style={{
                position: zL1?.layer ? "relative" : undefined,
                zIndex: zStyle(zL1?.layer),
              }}
              aria-label={t("landingCardAria", { name: displayName })}
              className={cn(
                "flex w-full max-w-[385px] flex-col gap-[10px] p-[15px]",
                "rounded-[25px] bg-[color:var(--oh-paper)]",
                "shadow-[inset_0_0_15px_rgba(0,0,0,0.25)]",
              )}
            >
              <motion.header
                layoutId={landingLayoutId("oh-identity")}
                transition={{ type: "spring", ...(drawerOpen ? openSpring : closeSpring) }}
                animate={{ opacity: oStyle(oL1?.identity, 1) }}
                exit={{ opacity: oStyle(oL1?.identity, 1) }}
                style={{ zIndex: zStyle(zL1?.identity) }}
                className="flex flex-col gap-3"
              >
                <div className="flex items-center gap-3">
                  <span
                    className={cn(
                      "relative inline-flex size-[55px] shrink-0",
                      "shadow-[0_4px_4px_rgba(0,0,0,0.25)] rounded-full",
                    )}
                  >
                    <Avatar className="size-[55px]">
                      <AvatarImage src={user.image ?? undefined} alt={displayName} />
                      <AvatarFallback className="size-[55px] bg-[color:var(--oh-tint)] font-[family-name:var(--oh-mono)] text-[11px] font-extrabold uppercase tracking-[1px]">
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                    <span
                      aria-hidden
                      className="pointer-events-none absolute inset-0 rounded-full ring-1 ring-[#E5E5E5]"
                    />
                  </span>
                  <h1 className="font-sans text-[clamp(32px,1rem+4vw,52px)] font-bold leading-[1.06] tracking-[-1.3px]">
                    {displayName}
                  </h1>
                </div>
                <p className="oh-description text-center">{t("defaultBio")}</p>
              </motion.header>

              <motion.div
                layoutId={landingLayoutId("oh-slot-list")}
                transition={{ type: "spring", ...(drawerOpen ? openSpring : closeSpring) }}
                animate={{ opacity: oStyle(oL1?.slotList, 1) }}
                exit={{ opacity: oStyle(oL1?.slotList, 1) }}
                style={{ zIndex: zStyle(zL1?.slotList) }}
                className={cn(
                  "flex flex-col gap-2.5 rounded-[20px] p-[15px]",
                  "bg-[#F5EFDF]",
                  "shadow-[inset_0_0_4px_rgba(0,0,0,0.25)]",
                )}
              >
                {hasOpenSlots ? (
                  <ul className="flex flex-col gap-2.5">
                    {SLOT_OPTIONS.map((opt, i) => (
                      <li key={opt.label}>
                        <motion.div
                          layoutId={landingLayoutId(`oh-slot-${i}`)}
                          transition={{ type: "spring", ...(drawerOpen ? openSpring : closeSpring) }}
                          animate={{
                            opacity: oStyle(
                              oL1
                                ? [oL1.slot0, oL1.slot1, oL1.slot2, oL1.slot3][i]
                                : undefined,
                              1,
                            ),
                          }}
                          exit={{
                            opacity: oStyle(
                              oL1
                                ? [oL1.slot0, oL1.slot1, oL1.slot2, oL1.slot3][i]
                                : undefined,
                              1,
                            ),
                          }}
                          style={{
                            zIndex: zStyle(
                              zL1
                                ? [zL1.slot0, zL1.slot1, zL1.slot2, zL1.slot3][i]
                                : undefined,
                            ),
                          }}
                        >
                          <motion.div
                            layout
                            transition={{ type: "spring", ...(drawerOpen ? openSpring : closeSpring) }}
                          >
                            <SlotRow
                              title="intro"
                              description="quick chat, voice only"
                              durationLabel={opt.label}
                              onClick={() => setDrawerOpen(true)}
                            />
                          </motion.div>
                        </motion.div>
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
              </motion.div>
            </motion.article>
          ) : null}
        </AnimatePresence>
      </div>

      <span className="sr-only" aria-hidden>
        {visitorTz} · {daysWithOpenSlotsThisWeek} · {nextSlot?.start ?? ""}
      </span>

      <AnimatePresence mode="popLayout">
        {hasOpenSlots && drawerOpen ? (
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
            onPickSlot={(s) => {
              setSelectedSlot(s);
              updateQueryParam("slot", s.start, { pushEntry: true });
            }}
            identityContent={
              <div className="flex items-center gap-3">
                <span
                  className={cn(
                    "relative inline-flex size-[55px] shrink-0",
                    "shadow-[0_4px_4px_rgba(0,0,0,0.25)] rounded-full",
                  )}
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
                </span>
                <h1 className="font-sans text-[clamp(32px,1rem+4vw,52px)] font-bold leading-[1.06] tracking-[-1.3px]">
                  {displayName}
                </h1>
              </div>
            }
          />
        ) : null}
      </AnimatePresence>
      </LayoutGroup>
    </OhVisitorShell>
  );
}

export const SLOT_OPTIONS = [
  { label: "15 min" },
  { label: "25 min" },
  { label: "30 min" },
  { label: "1 hr" },
] as const;

export function SlotRow({
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
  const match = /^(\d+)\s*(.+)$/.exec(durationLabel);
  const num = match?.[1] ?? durationLabel;
  const unit = match?.[2] ?? "";
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "oh-focus-ring group/slot flex h-[50px] w-full items-center justify-between gap-3",
        "rounded-[14px] bg-[color:var(--oh-paper)] px-[11px] text-left",
        "shadow-[0_0_4px_rgba(0,0,0,0.25)]",
        "transition-colors duration-150 ease-oh hover:bg-[color:var(--oh-tint)]",
      )}
    >
      <div className="flex min-w-0 flex-col items-center leading-tight">
        <span className="truncate font-sans text-[16px] font-bold leading-[19.2px]">
          {title}
        </span>
        <span className="truncate font-sans text-[12px] font-normal leading-[15px]">
          {description}
        </span>
      </div>
      <div className="flex items-baseline shrink-0 font-sans tabular-nums">
        <span className="text-[27.6px] font-bold leading-[29.14px] tracking-[-0.69px]">
          {num}
        </span>
        {unit ? (
          <span className="ml-1 text-[12px] font-normal leading-[15px]">
            {unit}
          </span>
        ) : null}
      </div>
    </button>
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
