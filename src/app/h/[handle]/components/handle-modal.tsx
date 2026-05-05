"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { FocusOn } from "react-focus-on";
import { useFormatter, useTranslations } from "next-intl";
import { ArrowLeftIcon, CalendarIcon } from "lucide-react";
import {
  BookingForm,
  DayStrip,
  DaySlots,
  MonthDrawer,
} from "@/components/calendar";
import { slotsOn, startOfToday, type Slot } from "@/lib/availability";
import animSpec from "@/../docs/figma/anim-h-handle-redesign.json";
import { useModalDebug, zStyle } from "../_components/visitor-debug-overlay";

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
  const phantomOpacity = debug?.phantomOpacity ?? 0;
  const phantomOutline = debug?.showPhantomOutline ?? false;
  const zL2 = debug?.zLayer2;

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
        aria-hidden
        className="fixed inset-0 z-40 bg-[color:var(--oh-ink)]/40"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="handle-modal-title"
        className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-8"
      >
        <motion.article
          layoutId="handle-card"
          transition={{ type: "spring", ...(open ? openSpring : closeSpring) }}
          style={{
            willChange: "transform",
            zIndex: zStyle(zL2?.layer),
          }}
          className="flex h-full max-h-[1158px] w-full max-w-[720px] flex-col gap-3 overflow-hidden rounded-[25px] bg-[color:var(--oh-paper)] p-[15px] shadow-[inset_0_0_15px_rgba(0,0,0,0.25)]"
        >
          <div
            aria-hidden
            className="pointer-events-none absolute -inset-[15px]"
          >
            <motion.div
              layoutId="oh-identity"
              transition={{ type: "spring", ...(open ? openSpring : closeSpring) }}
              style={{
                position: "absolute",
                top: 22,
                left: 192,
                width: 336,
                height: 87,
                opacity: phantomOpacity,
                outline: phantomOutline ? "1px dashed currentColor" : undefined,
                zIndex: zStyle(zL2?.identity),
              }}
            />
            <motion.div
              layoutId="oh-slot-list"
              transition={{ type: "spring", ...(open ? openSpring : closeSpring) }}
              style={{
                position: "absolute",
                inset: 0,
                opacity: phantomOpacity,
                outline: phantomOutline ? "1px dashed currentColor" : undefined,
                zIndex: zStyle(zL2?.slotList),
              }}
            >
              {Array.from({ length: 4 }).map((_, i) => (
                <motion.div
                  key={i}
                  layoutId={`oh-slot-${i}`}
                  transition={{ type: "spring", ...(open ? openSpring : closeSpring) }}
                  style={{
                    position: "absolute",
                    top: 15 + i * 282,
                    left: 15,
                    width: 690,
                    height: 282,
                    outline: phantomOutline ? "1px dashed currentColor" : undefined,
                    zIndex: zStyle(
                      zL2
                        ? [zL2.slot0, zL2.slot1, zL2.slot2, zL2.slot3][i]
                        : undefined,
                    ),
                  }}
                />
              ))}
            </motion.div>
          </div>
          <h2 id="handle-modal-title" className="sr-only">
            {view === "form"
              ? rescheduleFromUid
                ? t("rescheduleFormTitle")
                : t("bookingFormTitle")
              : t("drawerTitle")}
          </h2>
          <p className="sr-only">{t("drawerDescription")}</p>

          {view === "picker" ? (
            <div className="oh-drawer-monthbar">
              <span className="oh-drawer-monthbar-label">{monthBarLabel}</span>
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
              <span className="oh-drawer-monthbar-label opacity-65 truncate">
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
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
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
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
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
        </motion.article>
      </div>
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
