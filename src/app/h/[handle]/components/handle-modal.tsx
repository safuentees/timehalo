"use client";

import { useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { FocusOn } from "react-focus-on";
import { useFormatter, useTranslations } from "next-intl";
import { CalendarIcon, ChevronLeftIcon, XIcon } from "lucide-react";
import {
  BookingForm,
  DayStrip,
  DaySlots,
  MonthDrawer,
} from "@/components/calendar";
import { slotsOn, startOfToday, type Slot } from "@/lib/availability";
import animSpec from "@/../docs/figma/anim-h-handle-redesign.json";
import {
  oStyle,
  useModalDebug,
  zStyle,
} from "../_components/visitor-debug-overlay";
import {
  HANDLE_CARD_RADIUS_STYLE,
  HANDLE_SLOT_CONCENTRIC_OUTER_RADIUS,
  HANDLE_SLOT_LIST_RADIUS_STYLE,
  HANDLE_SLOT_ROW_RADIUS_STYLE,
  SLOT_OPTIONS,
  SlotRow,
  cornerRadiusStyle,
} from "./handle-morph-parts";
import { HandleMorphCard } from "./handle-morph-card";

const OPEN_SPRING = animSpec.transitions[0].spring;
const CLOSE_SPRING =
  animSpec.transitions.find(
    (t) => t.from?.name === "handle-detail" && t.to?.name === "handle",
  )?.spring ?? animSpec.transitions[2].spring;
const CONFIRM_SPRING =
  animSpec.transitions.find(
    (t) =>
      t.from?.name === "handle-detail" &&
      t.to?.name === "handle-detail" &&
      t.from?.id !== t.to?.id,
  )?.spring ?? animSpec.transitions[1].spring;

type Props = {
  handle: string;
  slots: Slot[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedDate: Date | undefined;
  onSelectDate: (date: Date | undefined) => void;
  onPickSlot: (slot: Slot) => void;
  selectedSlot: Slot | undefined;
  rescheduleFromUid?: string;
  months?: number;
  identityContent?: ReactNode;
  durationLabel?: string;
};

export function HandleModal({
  handle,
  slots,
  open,
  onOpenChange,
  selectedDate,
  onSelectDate,
  onPickSlot,
  selectedSlot,
  rescheduleFromUid,
  months = 3,
  identityContent,
  durationLabel,
}: Props) {
  const t = useTranslations("BookingCalendar");
  const format = useFormatter();
  const dayOfSlots = selectedDate ? slotsOn(slots, selectedDate) : [];
  const monthBarDate = selectedDate ?? startOfToday();
  const monthBarLabel = format
    .dateTime(monthBarDate, { month: "long", year: "numeric" })
    .toUpperCase();
  const [view, setView] = useState<"picker" | "form">("picker");

  const chromeRowText = (() => {
    if (!durationLabel) return undefined;
    if (view === "form" && selectedSlot) {
      const start = new Date(selectedSlot.start);
      const datePart = format.dateTime(start, {
        month: "long",
        day: "numeric",
      });
      const timePart = format.dateTime(start, {
        hour: "numeric",
        minute: "2-digit",
      });
      return `${durationLabel} on ${datePart} at ${timePart}`;
    }
    return durationLabel;
  })();

  const { values: debug, panelShardRef } = useModalDebug();
  const openSpring = debug?.openSpring ?? OPEN_SPRING;
  const closeSpring = debug?.closeSpring ?? CLOSE_SPRING;
  const confirmSpring = debug?.confirmSpring ?? CONFIRM_SPRING;
  const phantomOutline = debug?.showPhantomOutline ?? false;
  const phantomLabels = debug?.showPhantomLabels ?? false;
  const zL2 = debug?.zLayer2;
  const oL2 = debug?.oLayer2;
  function handlePickSlot(slot: Slot) {
    onPickSlot(slot);
    setView("form");
  }

  function handleSelectDate(nextDate: Date | undefined) {
    if (
      view === "form" &&
      (!nextDate ||
        (selectedSlot &&
          !isSameCalendarDay(new Date(selectedSlot.start), nextDate)))
    ) {
      setView("picker");
    }
    onSelectDate(nextDate);
  }

  if (!open) return null;

  return (
    <FocusOn
      enabled={open}
      onEscapeKey={() => onOpenChange(false)}
      onClickOutside={() => onOpenChange(false)}
      returnFocus
      shards={panelShardRef ? [panelShardRef] : undefined}
    >

      <motion.div
        layoutRoot
        role="dialog"
        aria-modal="true"
        aria-labelledby="handle-modal-title"
        className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-8"
      >
        <HandleMorphCard
          layoutId="handle-card"
          transition={{ type: "spring", ...(open ? openSpring : closeSpring) }}
          initial={{
            ...HANDLE_CARD_RADIUS_STYLE,
            opacity: oStyle(oL2?.layer, 1),
          }}
          animate={{
            ...HANDLE_CARD_RADIUS_STYLE,
            opacity: oStyle(oL2?.layer, 1),
          }}
          exit={{
            ...HANDLE_CARD_RADIUS_STYLE,
            opacity: oStyle(oL2?.layer, 1),
          }}
          style={{
            position: "relative",
            willChange: "transform",
            zIndex: zStyle(zL2?.layer),
          }}
          className="min-h-[clamp(500px,70dvh,900px)] max-w-[720px] overflow-hidden"
        >
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 z-0"
          >
            <motion.div
              layoutId="oh-identity"
              transition={{
                type: "spring",
                ...(open ? openSpring : closeSpring),
              }}
              initial={{ opacity: oStyle(oL2?.identity, 0) }}
              animate={{ opacity: oStyle(oL2?.identity, 0) }}
              exit={{ opacity: oStyle(oL2?.identity, 0) }}
              style={{
                position: "absolute",
                top: 21.5,
                left: 192.5,
                width: 336,
                height: 87,
                outline: phantomOutline ? "1px dashed currentColor" : undefined,
                zIndex: zStyle(zL2?.identity),
                pointerEvents: "none",
              }}
            >
              {identityContent ? identityContent : null}
              {phantomLabels ? (
                <span className="pointer-events-none absolute right-1 top-1 rounded-sm bg-amber-500/90 px-1.5 py-0.5 font-[family-name:var(--oh-mono)] text-[9px] font-bold uppercase tracking-[1px] text-black">
                  identity
                </span>
              ) : null}
            </motion.div>
          </div>

          <div className="absolute inset-[15px] z-10 flex min-h-0 flex-col gap-[15px]">
            <div className="relative z-30 grid h-7 shrink-0 grid-cols-3 items-center">
              <button
                type="button"
                onClick={() =>
                  view === "form" ? setView("picker") : onOpenChange(false)
                }
                aria-label={
                  view === "form"
                    ? t("backToPickerAria")
                    : t("closeDrawerAria")
                }
                className="oh-focus-ring group inline-flex size-7 shrink-0 items-center justify-center justify-self-start rounded-(--oh-r-xs) text-[color:var(--oh-ink)] [-webkit-tap-highlight-color:transparent]"
              >
                <ChevronLeftIcon
                  className="size-5 opacity-[0.7] transition-[opacity,transform] duration-150 ease-oh group-hover:scale-105 group-hover:opacity-100 group-active:scale-95 group-active:opacity-100"
                  strokeWidth={2.25}
                  aria-hidden
                />
              </button>
              <AnimatePresence mode="wait" initial={false}>
                {chromeRowText ? (
                  <motion.span
                    key={chromeRowText}
                    initial={{ y: 8, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: -8, opacity: 0 }}
                    transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
                    className="justify-self-center truncate font-[family-name:var(--font-grotesk)] text-sm font-semibold leading-none tracking-tight text-[color:var(--oh-ink)]"
                  >
                    {chromeRowText}
                  </motion.span>
                ) : (
                  <span className="justify-self-center" aria-hidden />
                )}
              </AnimatePresence>
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                aria-label={t("closeDrawerAria")}
                className="oh-focus-ring group inline-flex size-7 shrink-0 items-center justify-center justify-self-end rounded-(--oh-r-xs) text-[color:var(--oh-ink)] [-webkit-tap-highlight-color:transparent]"
              >
                <XIcon
                  className="size-5 opacity-[0.7] transition-[opacity,transform] duration-150 ease-oh group-hover:scale-105 group-hover:opacity-100 group-active:scale-95 group-active:opacity-100"
                  strokeWidth={2.25}
                  aria-hidden
                />
              </button>
            </div>
            <motion.div
              layoutId="oh-slot-list"
              transition={{
                type: "spring",
                ...(open ? openSpring : closeSpring),
              }}
              initial={{
                ...HANDLE_SLOT_LIST_RADIUS_STYLE,
                opacity: 1,
              }}
              animate={{
                ...HANDLE_SLOT_LIST_RADIUS_STYLE,
                opacity: 1,
              }}
              exit={{
                ...HANDLE_SLOT_LIST_RADIUS_STYLE,
                opacity: 1,
              }}
              style={{
                ...HANDLE_SLOT_LIST_RADIUS_STYLE,
                boxShadow: "inset 0 0 4px rgba(0,0,0,0.25)",
                outline: phantomOutline ? "1px dashed currentColor" : undefined,
                zIndex: zStyle(zL2?.slotList),
              }}
              className="relative z-10 flex min-h-0 flex-1 flex-col overflow-hidden bg-[#F5EFDF]"
            >
              {phantomLabels ? (
                <span className="pointer-events-none absolute left-1 top-1 z-30 rounded-sm bg-fuchsia-500/90 px-1.5 py-0.5 font-[family-name:var(--oh-mono)] text-[9px] font-bold uppercase tracking-[1px] text-white">
                  slot list
                </span>
              ) : null}

              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 z-0"
              >
                <motion.div
                  layoutId="oh-slot-stack"
                  transition={{
                    type: "spring",
                    ...(open ? openSpring : closeSpring),
                  }}
                  style={{
                    position: "absolute",
                    inset: 0,
                    display: "flex",
                    flexDirection: "column",
                    boxShadow: "none",
                  }}
                  className="p-[15px]"
                >
                  {Array.from({ length: 4 }).map((_, i) => {
                    const opt = SLOT_OPTIONS[i];
                    const slotRadiusStyle = cornerRadiusStyle(
                      HANDLE_SLOT_CONCENTRIC_OUTER_RADIUS,
                    );
                    return opt ? (
                      <div
                        key={i}
                        style={{
                          flex: 1,
                          minHeight: 0,
                          position: "relative",
                        }}
                      >
                        <SlotRow
                          inert
                          figmaLayer={`modal-slot-${i}`}
                          layoutId={`oh-slot-${i}`}
                          transition={{
                            type: "spring",
                            ...(open ? openSpring : closeSpring),
                          }}
                          initial={{
                            ...HANDLE_SLOT_ROW_RADIUS_STYLE,
                            opacity: oStyle(
                              oL2
                                ? [oL2.slot0, oL2.slot1, oL2.slot2, oL2.slot3][
                                    i
                                  ]
                                : undefined,
                              1,
                            ),
                          }}
                          animate={{
                            ...slotRadiusStyle,
                            opacity: oStyle(
                              oL2
                                ? [oL2.slot0, oL2.slot1, oL2.slot2, oL2.slot3][
                                    i
                                  ]
                                : undefined,
                              1,
                            ),
                          }}
                          exit={{
                            ...HANDLE_SLOT_ROW_RADIUS_STYLE,
                            opacity: oStyle(
                              oL2
                                ? [oL2.slot0, oL2.slot1, oL2.slot2, oL2.slot3][
                                    i
                                  ]
                                : undefined,
                              1,
                            ),
                          }}
                          style={{
                            position: "absolute",
                            inset: 0,
                            ...slotRadiusStyle,
                            boxShadow: "none",
                            outline: phantomOutline
                              ? "1px dashed currentColor"
                              : undefined,
                            zIndex: zStyle(
                              zL2
                                ? [zL2.slot0, zL2.slot1, zL2.slot2, zL2.slot3][
                                    i
                                  ]
                                : undefined,
                            ),
                            pointerEvents: "none",
                          }}
                          title="intro"
                          description="quick chat, voice only"
                          durationLabel={opt.label}
                          onClick={() => {}}
                        />
                        {phantomLabels ? (
                          <span className="pointer-events-none absolute right-1 top-1 rounded-sm bg-cyan-500/90 px-1.5 py-0.5 font-[family-name:var(--oh-mono)] text-[9px] font-bold uppercase tracking-[1px] text-black">
                            slot {i}
                          </span>
                        ) : null}
                      </div>
                    ) : null;
                  })}
                </motion.div>
              </div>

              <div className="relative z-10 flex min-h-0 flex-1 flex-col overflow-hidden rounded-sm ">
                <div className="relative z-10 shrink-0 px-5 pb-[clamp(14px,2vw,18px)] pt-[clamp(30px,4vw,40px)] sm:px-6">
                  <h2
                    id="handle-modal-title"
                    className="m-0 max-w-[min(560px,100%)] font-[family-name:var(--font-grotesk)] text-[clamp(28px,4.4vw,34px)] font-black leading-[0.98] tracking-[-0.045em] text-[color:var(--oh-ink)] [text-wrap:balance]"
                  >
                    {view === "form"
                      ? rescheduleFromUid
                        ? t("rescheduleFormTitle")
                        : t("bookingFormTitle")
                      : t("drawerTitle")}
                  </h2>
                  <p className="sr-only">{t("drawerDescription")}</p>
                </div>
                {view === "picker" ? (
                  <div className="oh-drawer-monthbar">
                    <span className="oh-drawer-monthbar-label">
                      {monthBarLabel}
                    </span>
                    <MonthDrawer
                      slots={slots}
                      selectedDate={selectedDate}
                      onSelectDate={handleSelectDate}
                      months={months}
                    >
                      <button
                        type="button"
                        className="oh-view-toggle"
                        aria-label={t("openMonthViewAria")}
                      >
                        <CalendarIcon />
                      </button>
                    </MonthDrawer>
                  </div>
                ) : (
                  <div className="oh-drawer-monthbar">
                    <span className="oh-drawer-monthbar-label truncate opacity-65">
                      {selectedSlot
                        ? format
                            .dateTime(new Date(selectedSlot.start), {
                              weekday: "short",
                              month: "short",
                              day: "numeric",
                              hour: "numeric",
                              minute: "2-digit",
                            })
                            .toUpperCase()
                        : ""}
                    </span>
                  </div>
                )}

                <div className="oh-drawer-body min-h-0 flex-1 overflow-y-auto">
                  <AnimatePresence mode="wait" initial={false}>
                    {view === "picker" ? (
                      <motion.div
                        key="picker"
                        initial={{ opacity: 1 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 1 }}
                        transition={{ type: "spring", ...confirmSpring }}
                      >
                        <DayStrip
                          slots={slots}
                          selectedDate={selectedDate}
                          onSelectDate={handleSelectDate}
                        />
                        {selectedDate ? (
                          <DaySlots
                            date={selectedDate}
                            slots={dayOfSlots}
                            onPick={handlePickSlot}
                          />
                        ) : (
                          <p className="oh-drawer-hint">
                            — {t("tapDateHint")} —
                          </p>
                        )}
                      </motion.div>
                    ) : (
                      <motion.div
                        key="form"
                        initial={{ opacity: 1 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 1 }}
                        transition={{ type: "spring", ...confirmSpring }}
                      >
                        {selectedSlot ? (
                          <BookingForm
                            handle={handle}
                            slotStart={selectedSlot.start}
                            rescheduleFromUid={rescheduleFromUid}
                          />
                        ) : null}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </motion.div>
          </div>
        </HandleMorphCard>
      </motion.div>
    </FocusOn>
  );
}

function isSameCalendarDay(left: Date, right: Date): boolean {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}
