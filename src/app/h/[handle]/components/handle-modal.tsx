"use client";

import { useState, useTransition, type ReactNode, type RefObject } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useIsPresent } from "motion/react";
import { FocusOn } from "react-focus-on";
import { useFormatter, useTranslations } from "next-intl";
import {
  CalendarIcon,
  ChevronLeftIcon,
  Loader2,
  XIcon,
} from "lucide-react";
import {
  BookingForm,
  DayStrip,
  DaySlots,
  MonthCalendar,
} from "@/components/calendar";
import { slotsOn, startOfToday, type Slot } from "@/lib/availability";
import { useRescheduleBooking } from "@/lib/mutations/use-reschedule-booking";
import { getBrowserTimezone } from "@/lib/timezone";
import animSpec from "@/../docs/figma/anim-h-handle-redesign.json";
import {
  oStyle,
  useModalDebug,
  zStyle,
} from "../_components/visitor-debug-overlay";
import {
  FALLBACK_SLOT_OPTIONS,
  HANDLE_CARD_RADIUS_STYLE,
  HANDLE_SLOT_CONCENTRIC_OUTER_RADIUS,
  HANDLE_SLOT_LIST_RADIUS_STYLE,
  HANDLE_SLOT_ROW_RADIUS_STYLE,
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
  onBookingComplete?: () => void;
  months?: number;
  identityContent?: ReactNode;
  durationLabel?: string;
  durationMinutes?: number;
  extraShards?: ReadonlyArray<RefObject<HTMLElement | null>>;
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
  onBookingComplete,
  months = 3,
  identityContent,
  durationLabel,
  durationMinutes,
  extraShards,
}: Props) {
  const t = useTranslations("BookingCalendar");
  const tHost = useTranslations("HostProfile");
  const format = useFormatter();
  const dayOfSlots = selectedDate ? slotsOn(slots, selectedDate) : [];
  const monthBarDate = selectedDate ?? startOfToday();
  const monthBarLabel = format
    .dateTime(monthBarDate, { month: "long", year: "numeric" })
    .toUpperCase();
  const [view, setView] = useState<"strip" | "month" | "form">("strip");
  const isPresent = useIsPresent();

  const router = useRouter();
  const [isRescheduleTransitionPending, startRescheduleTransition] =
    useTransition();
  const [rescheduleIdempotencyKey] = useState(() => crypto.randomUUID());
  const reschedule = useRescheduleBooking({
    onSuccess: (result) => {
      startRescheduleTransition(() => {
        router.replace(`/h/${handle}/booked/${result.publicUid}`);
        onBookingComplete?.();
      });
    },
  });
  const isReschedulePending =
    reschedule.isPending || isRescheduleTransitionPending;

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
      return tHost("chromeRowSlotTitle", {
        duration: durationLabel,
        date: datePart,
        time: timePart,
      });
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
  const detailTitleId = "handle-modal-title";
  const monthTitleId = "handle-modal-title-month";
  const formTitleId = "handle-modal-title-form";
  const currentTitleId =
    view === "month"
      ? monthTitleId
      : view === "form"
        ? formTitleId
        : detailTitleId;
  function handlePickSlot(slot: Slot) {
    if (isReschedulePending) return;
    onPickSlot(slot);
    if (rescheduleFromUid) {
      reschedule.mutate({
        oldPublicUid: rescheduleFromUid,
        newSlotStart: slot.start,
        idempotencyKey: rescheduleIdempotencyKey,
        visitorTimezone: getBrowserTimezone(),
      });
      return;
    }
    setView("form");
  }

  function handleSelectDate(nextDate: Date | undefined) {
    if (isReschedulePending) return;
    if (
      view === "form" &&
      (!nextDate ||
        (selectedSlot &&
          !isSameCalendarDay(new Date(selectedSlot.start), nextDate)))
    ) {
      setView("strip");
    }
    onSelectDate(nextDate);
  }

  function handleMonthPick(nextDate: Date) {
    if (isReschedulePending) return;
    onSelectDate(nextDate);
    setView("strip");
  }

  function renderChromeRow() {
    return (
      <div className="relative z-30 grid h-7 shrink-0 grid-cols-3 items-center">
        <button
          type="button"
          onClick={() => {
            if (isReschedulePending) return;
            if (view === "strip") onOpenChange(false);
            else setView("strip");
          }}
          aria-label={
            view === "strip" ? t("closeDrawerAria") : t("backToPickerAria")
          }
          disabled={isReschedulePending}
          aria-disabled={isReschedulePending}
          className="oh-focus-ring group inline-flex size-7 shrink-0 items-center justify-center justify-self-start rounded-(--oh-r-xs) text-[color:var(--oh-ink)] transition-opacity [-webkit-tap-highlight-color:transparent] disabled:cursor-not-allowed disabled:opacity-30"
        >
          <ChevronLeftIcon
            className="size-5 opacity-[0.7] transition-[opacity,transform] duration-150 ease-oh group-active:scale-95 group-active:opacity-100"
            strokeWidth={2.25}
            aria-hidden
          />
        </button>
        <motion.span
          layoutId="oh-modal-chrome-title"
          layout="position"
          transition={{ type: "spring", ...openSpring }}
          className="inline-flex min-w-0 items-center justify-self-center gap-1.5 font-[family-name:var(--font-grotesk)] text-sm font-semibold leading-none tracking-tight text-[color:var(--oh-ink)]"
        >
          <AnimatePresence mode="wait" initial={false}>
            {chromeRowText ? (
              <motion.span
                key={chromeRowText}
                initial={{ y: 8, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -8, opacity: 0 }}
                transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
                className="block min-w-0 truncate"
              >
                {chromeRowText}
              </motion.span>
            ) : null}
          </AnimatePresence>
          <AnimatePresence initial={false}>
            {isReschedulePending ? (
              <motion.span
                key="reschedule-loader"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
                className="inline-flex shrink-0 items-center"
                aria-hidden
              >
                <Loader2
                  className="size-3.5 animate-spin opacity-65"
                  strokeWidth={2.25}
                />
              </motion.span>
            ) : null}
          </AnimatePresence>
        </motion.span>
        <button
          type="button"
          onClick={() => {
            if (isReschedulePending) return;
            onOpenChange(false);
          }}
          aria-label={t("closeDrawerAria")}
          disabled={isReschedulePending}
          aria-disabled={isReschedulePending}
          className="oh-focus-ring group inline-flex size-7 shrink-0 items-center justify-center justify-self-end rounded-(--oh-r-xs) text-[color:var(--oh-ink)] transition-opacity [-webkit-tap-highlight-color:transparent] disabled:cursor-not-allowed disabled:opacity-30"
        >
          <XIcon
            className="size-5 opacity-[0.7] transition-[opacity,transform] duration-150 ease-oh group-active:scale-95 group-active:opacity-100"
            strokeWidth={2.25}
            aria-hidden
          />
        </button>
      </div>
    );
  }

  function renderIdentityPhantom() {
    const identityOpacity = oStyle(oL2?.identity, 0);
    const showIdentityContent = identityOpacity > 0;

    return (
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0 flex justify-center"
        style={{ paddingTop: 21.5 }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            width: "100%",
            maxWidth: 336,
            height: 87,
            outline: phantomOutline ? "1px dashed currentColor" : undefined,
            opacity: identityOpacity,
            zIndex: zStyle(zL2?.identity),
            pointerEvents: "none",
          }}
        >
          {showIdentityContent && identityContent ? identityContent : null}
          {phantomLabels ? (
            <span className="pointer-events-none absolute right-1 top-1 rounded-sm bg-amber-500/90 px-1.5 py-0.5 font-[family-name:var(--oh-mono)] text-[9px] font-bold uppercase tracking-[1px] text-black">
              identity
            </span>
          ) : null}
        </div>
      </div>
    );
  }

  function renderSlotPhantoms({
    mode,
  }: {
    mode: "visible" | "measure";
  }) {
    const isVisible = mode === "visible" || !isPresent;

    return (
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0 [&_*]:pointer-events-none"
        style={{ opacity: isVisible ? 1 : 0 }}
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
            pointerEvents: "none",
          }}
          className="p-[15px]"
        >
          {Array.from({ length: 4 }).map((_, i) => {
            const opt = FALLBACK_SLOT_OPTIONS[0];
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
                    outline: phantomOutline ? "1px dashed currentColor" : undefined,
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
      </div>
    );
  }

  function renderCardShell({
    keyName,
    titleId,
    className,
    slotPhantomMode,
    sizing = "fill",
    children,
  }: {
    keyName: string;
    titleId: string;
    className: string;
    slotPhantomMode: "visible" | "measure";
    sizing?: "fill" | "hug" | "square";
    children: ReactNode;
  }) {
    const fillsAvailableSpace = sizing === "fill";
    const squaresAvailableSpace = sizing === "square";
    const stretchesSlotList = fillsAvailableSpace || squaresAvailableSpace;
    const slotListRadiusStyle = fillsAvailableSpace
      ? HANDLE_SLOT_LIST_RADIUS_STYLE
      : cornerRadiusStyle(
          HANDLE_SLOT_CONCENTRIC_OUTER_RADIUS,
          HANDLE_SLOT_CONCENTRIC_OUTER_RADIUS,
          HANDLE_SLOT_CONCENTRIC_OUTER_RADIUS,
          HANDLE_SLOT_CONCENTRIC_OUTER_RADIUS,
        );

    return (
      <HandleMorphCard
        key={keyName}
        layoutId="handle-card"
        layoutCrossfade={false}
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
        className={className}
      >
        {renderIdentityPhantom()}

        <div
          className={
            fillsAvailableSpace
              ? "absolute inset-[15px] z-10 flex min-h-0 flex-col gap-[15px]"
              : squaresAvailableSpace
                ? "relative z-10 flex min-h-0 flex-1 flex-col gap-[15px] p-[15px]"
                : "relative z-10 flex flex-col gap-[15px] p-[15px]"
          }
        >
          {renderChromeRow()}
          <motion.div
            layoutId="oh-slot-list"
            transition={{
              type: "spring",
              ...(open ? openSpring : closeSpring),
            }}
            initial={{
              ...slotListRadiusStyle,
              opacity: 1,
            }}
            animate={{
              ...slotListRadiusStyle,
              opacity: 1,
            }}
            exit={{
              ...slotListRadiusStyle,
              opacity: 1,
            }}
            style={{
              ...slotListRadiusStyle,
              boxShadow: "inset 0 0 4px rgba(0,0,0,0.25)",
              outline: phantomOutline ? "1px dashed currentColor" : undefined,
              zIndex: zStyle(zL2?.slotList),
            }}
            className={
              stretchesSlotList
                ? "relative z-10 flex min-h-0 flex-1 flex-col overflow-hidden bg-[#F5EFDF] dark:bg-[#272727]"
                : "relative z-10 flex min-h-0 shrink-0 flex-col overflow-hidden bg-[#F5EFDF] dark:bg-[#272727]"
            }
          >
            {phantomLabels ? (
              <span className="pointer-events-none absolute left-1 top-1 z-30 rounded-sm bg-fuchsia-500/90 px-1.5 py-0.5 font-[family-name:var(--oh-mono)] text-[9px] font-bold uppercase tracking-[1px] text-white">
                slot list
              </span>
            ) : null}
            {renderSlotPhantoms({ mode: slotPhantomMode })}
            <div
              className={
                stretchesSlotList
                  ? "relative z-10 flex min-h-0 flex-1 flex-col overflow-hidden rounded-sm"
                  : "relative z-10 flex min-h-0 shrink-0 flex-col overflow-hidden rounded-sm"
              }
            >
              <div className="relative z-10 shrink-0 px-5 pb-[clamp(14px,2vw,18px)] pt-[clamp(30px,4vw,40px)] sm:px-6">
                <motion.h2
                  layoutId="oh-modal-title"
                  layout="position"
                  transition={{
                    type: "spring",
                    ...(open ? openSpring : closeSpring),
                  }}
                  initial={{ opacity: 1 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 1 }}
                  id={titleId}
                  className="m-0 max-w-[min(560px,100%)] font-[family-name:var(--font-grotesk)] text-[clamp(28px,4.4vw,34px)] font-black leading-[0.98] tracking-[-0.045em] text-[color:var(--oh-ink)] [text-wrap:balance]"
                >
                  {view === "form"
                    ? rescheduleFromUid
                      ? t("rescheduleFormTitle")
                      : t("bookingFormTitle")
                    : t("drawerTitle")}
                </motion.h2>
                <p className="sr-only">{t("drawerDescription")}</p>
              </div>
              {children}
            </div>
          </motion.div>
        </div>
      </HandleMorphCard>
    );
  }

  function renderDetailBody() {
    return (
      <>
        <div className="oh-drawer-monthbar">
          <span className="oh-drawer-monthbar-label">{monthBarLabel}</span>
          <button
            type="button"
            onClick={() => {
              if (isReschedulePending) return;
              setView("month");
            }}
            disabled={isReschedulePending}
            aria-disabled={isReschedulePending}
            className="oh-focus-ring inline-flex size-7 shrink-0 items-center justify-center rounded-(--oh-r-xs) text-[color:var(--oh-ink)] transition-opacity [-webkit-tap-highlight-color:transparent] disabled:cursor-not-allowed disabled:opacity-30"
            aria-label={t("openMonthViewAria")}
          >
            <CalendarIcon
              className="size-5 opacity-[0.7]"
              strokeWidth={2.25}
              aria-hidden
            />
          </button>
        </div>
        <div className="oh-drawer-body min-h-0 flex-1 overflow-y-auto">
          <motion.div
            key="strip"
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
                selectedSlot={selectedSlot}
              />
            ) : (
              <p className="oh-drawer-hint">— {t("tapDateHint")} —</p>
            )}
          </motion.div>
        </div>
      </>
    );
  }

  function renderFormBody() {
    return (
      <div className="pointer-events-auto relative z-30 px-5 pb-8 pt-2 sm:px-6">
        {selectedSlot ? (
          <BookingForm
            handle={handle}
            slotStart={selectedSlot.start}
            rescheduleFromUid={rescheduleFromUid}
            durationMinutes={durationMinutes}
            onBooked={onBookingComplete}
          />
        ) : null}
      </div>
    );
  }

  function renderMonthBody() {
    return (
      <div className="pointer-events-auto relative z-30 flex min-h-0 flex-1 flex-col overflow-hidden">
        <MonthCalendar
          slots={slots}
          selectedDate={selectedDate}
          onSelectDate={handleMonthPick}
          months={months}
        />
      </div>
    );
  }

  if (!open) return null;

  return (
    <FocusOn
      enabled={open}
      onEscapeKey={() => {
        if (isReschedulePending) return;
        onOpenChange(false);
      }}
      onClickOutside={() => {
        if (isReschedulePending) return;
        onOpenChange(false);
      }}
      returnFocus
      scrollLock={false}
      shards={[
        ...(panelShardRef ? [panelShardRef] : []),
        ...(extraShards ?? []),
      ]}
    >

      <motion.div
        layoutRoot
        role="dialog"
        aria-modal="true"
        aria-labelledby={currentTitleId}
        className={
          rescheduleFromUid
            ? "fixed inset-0 z-50 flex items-center justify-center px-4 pb-4 pt-24 sm:px-8 sm:pb-8 sm:pt-28"
            : "fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-8"
        }
      >
        <AnimatePresence mode="popLayout" initial={false}>
          {view === "month"
            ? renderCardShell({
                keyName: "month-card",
                titleId: monthTitleId,
                className: "h-full max-h-[1158px] max-w-[720px] overflow-hidden",
                slotPhantomMode: "measure",
                children: renderMonthBody(),
              })
            : view === "form"
              ? renderCardShell({
                  keyName: "form-card",
                  titleId: formTitleId,
                  className:
                    "min-h-[min(calc(100dvw-32px),450px)] w-[min(calc(100dvw-32px),450px)] max-w-none overflow-hidden sm:min-h-[min(calc(100dvw-64px),450px)] sm:w-[min(calc(100dvw-64px),450px)]",
                  slotPhantomMode: "measure",
                  sizing: "square",
                  children: renderFormBody(),
                })
            : renderCardShell({
                keyName: "detail-card",
                titleId: detailTitleId,
                className:
                  "min-h-[clamp(500px,70dvh,900px)] max-w-[720px] overflow-hidden",
                slotPhantomMode: "visible",
                children: renderDetailBody(),
              })}
        </AnimatePresence>
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
