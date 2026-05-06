"use client";

import { useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { FocusOn } from "react-focus-on";
import { useFormatter, useTranslations } from "next-intl";
import { ArrowLeftIcon, CalendarIcon, XIcon } from "lucide-react";
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
} from "./host-profile";

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
}: Props) {
  const t = useTranslations("BookingCalendar");
  const format = useFormatter();
  const dayOfSlots = selectedDate ? slotsOn(slots, selectedDate) : [];
  const monthBarDate = selectedDate ?? startOfToday();
  const monthBarLabel = format
    .dateTime(monthBarDate, { month: "long", year: "numeric" })
    .toUpperCase();
  const [view, setView] = useState<"picker" | "form">("picker");

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
        <motion.article
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
            ...HANDLE_CARD_RADIUS_STYLE,
            boxShadow: "inset 0 0 15px rgba(0,0,0,0.25)",
            willChange: "transform",
            zIndex: zStyle(zL2?.layer),
          }}
          className="flex h-full max-h-[1158px] w-full max-w-[720px] flex-col overflow-hidden bg-[color:var(--oh-paper)]"
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
            <motion.div
              layoutId="oh-slot-list"
              transition={{
                type: "spring",
                ...(open ? openSpring : closeSpring),
              }}
              initial={{
                ...HANDLE_SLOT_LIST_RADIUS_STYLE,
                opacity: oStyle(oL2?.slotList, 0),
              }}
              animate={{
                ...HANDLE_SLOT_LIST_RADIUS_STYLE,
                opacity: oStyle(oL2?.slotList, 0),
              }}
              exit={{
                ...HANDLE_SLOT_LIST_RADIUS_STYLE,
                opacity: oStyle(oL2?.slotList, 0),
              }}
              style={{
                position: "absolute",
                inset: 15,
                ...HANDLE_SLOT_LIST_RADIUS_STYLE,
                boxShadow: "inset 0 0 4px rgba(0,0,0,0.25)",
                outline: phantomOutline ? "1px dashed currentColor" : undefined,
                zIndex: zStyle(zL2?.slotList),
              }}
              className="bg-[#F5EFDF]"
            >
              {phantomLabels ? (
                <span className="pointer-events-none absolute left-1 top-1 rounded-sm bg-fuchsia-500/90 px-1.5 py-0.5 font-[family-name:var(--oh-mono)] text-[9px] font-bold uppercase tracking-[1px] text-white">
                  slot list
                </span>
              ) : null}
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
                  const concentricRadius = HANDLE_SLOT_CONCENTRIC_OUTER_RADIUS;
                  const slotRadiusStyle = cornerRadiusStyle(
                    i === 0 ? concentricRadius : 0,
                    i === 0 ? concentricRadius : 0,
                    i === 3 ? concentricRadius : 0,
                    i === 3 ? concentricRadius : 0,
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
                              ? [oL2.slot0, oL2.slot1, oL2.slot2, oL2.slot3][i]
                              : undefined,
                            1,
                          ),
                        }}
                        animate={{
                          ...slotRadiusStyle,
                          opacity: oStyle(
                            oL2
                              ? [oL2.slot0, oL2.slot1, oL2.slot2, oL2.slot3][i]
                              : undefined,
                            1,
                          ),
                        }}
                        exit={{
                          ...HANDLE_SLOT_ROW_RADIUS_STYLE,
                          opacity: oStyle(
                            oL2
                              ? [oL2.slot0, oL2.slot1, oL2.slot2, oL2.slot3][i]
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
                              ? [zL2.slot0, zL2.slot1, zL2.slot2, zL2.slot3][i]
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
            </motion.div>
          </div>
          <div className="relative z-10 flex min-h-0 flex-1 flex-col overflow-hidden rounded-sm">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              aria-label={t("closeDrawerAria")}
              className="oh-focus-ring absolute right-[14px] top-[14px] z-10 inline-flex size-7 items-center justify-center rounded-[2px] bg-[color:var(--oh-paper)] text-[color:var(--oh-ink)] transition-colors duration-150 ease-oh hover:bg-[color:var(--oh-ink)] hover:text-[color:var(--oh-paper)]"
            >
              <XIcon className="size-4" aria-hidden />
            </button>
            <div className="oh-modal-close-bar" aria-hidden />
            <div className="oh-drawer-head">
              <h2 id="handle-modal-title" className="oh-drawer-title">
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
                <button
                  type="button"
                  onClick={() => setView("picker")}
                  aria-label={t("backToPickerAria")}
                  className="oh-view-toggle inline-flex items-center gap-1 text-[12px] font-[family-name:var(--oh-mono)] uppercase tracking-[1px]"
                >
                  <ArrowLeftIcon className="size-4" />
                  {t("backToPicker")}
                </button>
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
                      <p className="oh-drawer-hint">— {t("tapDateHint")} —</p>
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
        </motion.article>
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
