"use client";

import { useEffect, useId, useRef } from "react";
import { ChevronRightIcon } from "lucide-react";
import { Popover } from "@base-ui/react/popover";
import { cn } from "@/lib/utils";

// Custom oh-themed time picker. Replaces the previous opacity-0
// `<input type="time">` overlay (B.PT52) — that pattern relied on the
// browser's native picker, which iOS Safari opens reliably but Chrome
// + Firefox + Safari desktop don't open on click of an arbitrary
// container (only on click of the calendar-picker-indicator pseudo
// element, with quirks across engines). Hosts couldn't change the
// hour from desktop.
//
// Three columns: hour (1-12, scrollable), minute (00/15/30/45),
// period (AM/PM). 15-min increments match cal.com's `INCREMENT = 15`
// at `packages/features/schedules/components/ScheduleComponent.tsx`.
//
// 12-hour format matches the trigger's display ("9:00 AM"). The
// internal value stays "HH:MM" 24-hour to keep the form schema +
// availability logic unchanged.

const HOURS = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] as const;
const MINUTES = [0, 15, 30, 45] as const;
const PERIODS = ["AM", "PM"] as const;

type Period = (typeof PERIODS)[number];

function parse(value: string): { period: Period; hour12: number; minute: number } {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return { period: "AM", hour12: 12, minute: 0 };
  const h = Number(match[1]);
  const minute = Number(match[2]);
  const period: Period = h < 12 ? "AM" : "PM";
  const hour12 = ((h + 11) % 12) + 1;
  return { period, hour12, minute };
}

function compose(period: Period, hour12: number, minute: number): string {
  const baseHour = hour12 === 12 ? 0 : hour12;
  const h24 = period === "PM" ? baseHour + 12 : baseHour;
  return `${String(h24).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function formatDisplay(value: string): string {
  const { period, hour12, minute } = parse(value);
  return `${hour12}:${String(minute).padStart(2, "0")} ${period}`;
}

export type OhTimePickerProps = {
  value: string;
  onChange: (next: string) => void;
  label: string;
  ariaLabel: string;
  disabled?: boolean;
};

export function OhTimePicker({
  value,
  onChange,
  label,
  ariaLabel,
  disabled,
}: OhTimePickerProps) {
  // Stable trigger id (B.PT48 / B.PT50 lesson) — bypasses Base UI's
  // useBaseUiId fallback so SSR/CSR ids match.
  const reactId = useId();
  const { period, hour12, minute } = parse(value);

  const setHour = (next: number) =>
    onChange(compose(period, next, minute));
  const setMinute = (next: number) =>
    onChange(compose(period, hour12, next));
  const setPeriod = (next: Period) =>
    onChange(compose(next, hour12, minute));

  return (
    <Popover.Root>
      <Popover.Trigger
        id={`oh-time-picker-${reactId}`}
        disabled={disabled}
        className="oh-time-picker-trigger group"
        aria-label={ariaLabel}
      >
        <span className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className="oh-eyebrow">{label}</span>
          <span className="truncate text-[18px] leading-[1.1] font-black tabular-nums">
            {formatDisplay(value)}
          </span>
        </span>
        <ChevronRightIcon
          className="size-4 shrink-0 opacity-45 transition-[opacity,transform] duration-150 ease-oh group-hover:opacity-100 group-data-[popup-open]:rotate-90 group-data-[popup-open]:opacity-100"
          aria-hidden
        />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner
          className="oh-time-picker-positioner"
          sideOffset={8}
          align="start"
          // Inline z-index belt-and-suspenders — the dialog/drawer the
          // picker lives inside has its own stacking context. Same
          // pattern the workspace switcher menu uses.
          style={{ zIndex: 100 }}
        >
          <Popover.Popup className="oh-time-picker-popup">
            <PickColumn
              ariaLabel="Hour"
              values={HOURS}
              activeValue={hour12}
              onSelect={setHour}
            />
            <div className="oh-time-picker-divider" aria-hidden />
            <PickColumn
              ariaLabel="Minute"
              values={MINUTES}
              activeValue={minute}
              onSelect={setMinute}
              format={(v) => String(v).padStart(2, "0")}
            />
            <div className="oh-time-picker-divider" aria-hidden />
            <div
              role="listbox"
              aria-label="AM or PM"
              className="oh-time-picker-column oh-time-picker-column--periods"
            >
              {PERIODS.map((p) => (
                <button
                  key={p}
                  type="button"
                  role="option"
                  aria-selected={p === period}
                  onClick={() => setPeriod(p)}
                  className={cn(
                    "oh-time-picker-cell",
                    p === period && "is-active",
                  )}
                >
                  {p}
                </button>
              ))}
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

function PickColumn({
  ariaLabel,
  values,
  activeValue,
  onSelect,
  format,
}: {
  ariaLabel: string;
  values: ReadonlyArray<number>;
  activeValue: number;
  onSelect: (v: number) => void;
  format?: (v: number) => string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  // Scroll active row into view when the popup mounts. The Popover's
  // Portal unmounts on close, so this effect fires every time the
  // user reopens — putting the current value at center of the
  // scroll viewport without animation (instant feels right; smooth
  // scroll inside a freshly-mounted popup reads as motion glitch).
  useEffect(() => {
    const active = ref.current?.querySelector<HTMLButtonElement>(
      '[data-active="true"]',
    );
    active?.scrollIntoView({ block: "center", behavior: "auto" });
  }, []);

  return (
    <div
      ref={ref}
      role="listbox"
      aria-label={ariaLabel}
      className="oh-time-picker-column"
    >
      {values.map((v) => {
        const isActive = v === activeValue;
        return (
          <button
            key={v}
            type="button"
            role="option"
            aria-selected={isActive}
            data-active={isActive}
            onClick={() => onSelect(v)}
            className={cn(
              "oh-time-picker-cell",
              isActive && "is-active",
            )}
          >
            {format ? format(v) : String(v)}
          </button>
        );
      })}
    </div>
  );
}
