"use client";

import {
  forwardRef,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { ChevronRightIcon } from "lucide-react";
import { Popover } from "@base-ui/react/popover";
import { cn } from "@/lib/utils";
import { OhPillSwitcher } from "@/components/oh/oh-pill-switcher";
import { useResponsiveModalPortalContainer } from "@/components/ui/responsive-modal";

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
  const reactId = useId();

  const date = useMemo(() => stringToDate(value), [value]);
  const setDate = (next: Date | undefined) => {
    if (!next) return;
    onChange(dateToString(next));
  };

  const period: Period = date.getHours() >= 12 ? "PM" : "AM";

  const hourRef = useRef<HTMLInputElement>(null);
  const minuteRef = useRef<HTMLInputElement>(null);

  const portalContainer = useResponsiveModalPortalContainer();

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
      <Popover.Portal container={portalContainer}>
        <Popover.Positioner
          className="oh-time-picker-positioner"
          sideOffset={8}
          align="start"
          style={{ zIndex: 100 }}
        >
          <Popover.Popup className="oh-time-picker-popup">
            <div className="flex items-end gap-2">
              <FieldStack labelText="Hour">
                <OhTimePickerInput
                  ref={hourRef}
                  picker="12hours"
                  period={period}
                  date={date}
                  setDate={setDate}
                  onRightFocus={() => minuteRef.current?.focus()}
                />
              </FieldStack>
              <span
                aria-hidden
                className="select-none self-end pb-2 text-[18px] font-black opacity-55"
              >
                :
              </span>
              <FieldStack labelText="Minute">
                <OhTimePickerInput
                  ref={minuteRef}
                  picker="minutes"
                  date={date}
                  setDate={setDate}
                  onLeftFocus={() => hourRef.current?.focus()}
                />
              </FieldStack>
              <FieldStack labelText="Period">
                <PeriodToggle
                  period={period}
                  onChange={(next) => {
                    const tempDate = new Date(date);
                    const hours = display12HourValue(date.getHours());
                    setDate(setDateByType(tempDate, hours, "12hours", next));
                  }}
                />
              </FieldStack>
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

function FieldStack({
  labelText,
  children,
}: {
  labelText: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <span className="oh-eyebrow opacity-55">{labelText}</span>
      {children}
    </div>
  );
}

function PeriodToggle({
  period,
  onChange,
}: {
  period: Period;
  onChange: (next: Period) => void;
}) {
  return (
    <OhPillSwitcher
      ariaLabel="AM or PM"
      value={period}
      onChange={onChange}
      className="!h-(--oh-time-picker-control-h) !shadow-[inset_0_3px_10px_rgba(0,0,0,0.16)]"
      options={[
        { value: "AM", label: "AM" },
        { value: "PM", label: "PM" },
      ]}
    />
  );
}

type TimePickerType = "minutes" | "hours" | "12hours";
type Period = "AM" | "PM";
const PERIODS: ReadonlyArray<Period> = ["AM", "PM"];

interface OhTimePickerInputProps {
  picker: TimePickerType;
  date: Date;
  setDate: (date: Date | undefined) => void;
  period?: Period;
  onRightFocus?: () => void;
  onLeftFocus?: () => void;
}

const OhTimePickerInput = forwardRef<HTMLInputElement, OhTimePickerInputProps>(
  (
    { picker, period, date, setDate, onLeftFocus, onRightFocus },
    ref,
  ) => {
    const [flag, setFlag] = useState(false);
    const [prevIntKey, setPrevIntKey] = useState("0");

    useEffect(() => {
      if (!flag) return;
      const t = setTimeout(() => setFlag(false), 2000);
      return () => clearTimeout(t);
    }, [flag]);

    const calculatedValue = useMemo(
      () => getDateByType(date, picker),
      [date, picker],
    );

    const calculateNewValue = (key: string) => {
      if (picker === "12hours") {
        if (flag && calculatedValue.slice(1, 2) === "1" && prevIntKey === "0")
          return "0" + key;
      }
      return !flag ? "0" + key : calculatedValue.slice(1, 2) + key;
    };

    const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Tab") return;
      e.preventDefault();
      if (e.key === "ArrowRight") onRightFocus?.();
      if (e.key === "ArrowLeft") onLeftFocus?.();
      if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        const direction = e.key === "ArrowUp" ? 1 : -1;
        const step = picker === "minutes" ? 15 * direction : direction;
        const newValue = getArrowByType(calculatedValue, step, picker);
        if (flag) setFlag(false);
        const tempDate = new Date(date);
        setDate(setDateByType(tempDate, newValue, picker, period));
      }
      if (e.key >= "0" && e.key <= "9") {
        if (picker === "12hours") setPrevIntKey(e.key);
        const newValue = calculateNewValue(e.key);
        if (flag) onRightFocus?.();
        setFlag((prev) => !prev);
        const tempDate = new Date(date);
        setDate(setDateByType(tempDate, newValue, picker, period));
      }
    };

    return (
      <input
        ref={ref}
        type="tel"
        inputMode="decimal"
        value={calculatedValue}
        onChange={(e) => e.preventDefault()}
        onKeyDown={handleKeyDown}
        aria-label={picker === "12hours" ? "Hour" : picker}
        className="oh-time-picker-input"
      />
    );
  },
);

OhTimePickerInput.displayName = "OhTimePickerInput";

function isValid12Hour(v: string) {
  return /^(0[1-9]|1[0-2])$/.test(v);
}
function isValidMinute(v: string) {
  return /^[0-5][0-9]$/.test(v);
}

function getValidNumber(
  v: string,
  { max, min = 0, loop = false }: { max: number; min?: number; loop?: boolean },
) {
  let n = parseInt(v, 10);
  if (Number.isNaN(n)) return "00";
  if (loop) {
    if (n > max) n = min;
    if (n < min) n = max;
  } else {
    if (n > max) n = max;
    if (n < min) n = min;
  }
  return n.toString().padStart(2, "0");
}

function getValid12Hour(v: string) {
  if (isValid12Hour(v)) return v;
  return getValidNumber(v, { min: 1, max: 12 });
}

function getValidMinute(v: string) {
  if (isValidMinute(v)) return v;
  return getValidNumber(v, { max: 59 });
}

function getValidArrowNumber(
  v: string,
  { min, max, step }: { min: number; max: number; step: number },
) {
  let n = parseInt(v, 10);
  if (Number.isNaN(n)) return "00";
  n += step;
  return getValidNumber(String(n), { min, max, loop: true });
}

function getArrowByType(v: string, step: number, t: TimePickerType) {
  switch (t) {
    case "minutes":
      return getValidArrowNumber(snapToGrid(v, 15), { min: 0, max: 59, step });
    case "hours":
      return getValidArrowNumber(v, { min: 0, max: 23, step });
    case "12hours":
      return getValidArrowNumber(v, { min: 1, max: 12, step });
    default:
      return "00";
  }
}

function snapToGrid(v: string, step: number) {
  const n = parseInt(v, 10);
  if (Number.isNaN(n)) return "00";
  return String(Math.round(n / step) * step).padStart(2, "0");
}

function getDateByType(date: Date, t: TimePickerType) {
  switch (t) {
    case "minutes":
      return getValidMinute(String(date.getMinutes()));
    case "hours":
      return getValidNumber(String(date.getHours()), { max: 23 });
    case "12hours":
      return getValid12Hour(String(display12HourValue(date.getHours())));
    default:
      return "00";
  }
}

function setDateByType(
  date: Date,
  value: string,
  type: TimePickerType,
  period?: Period,
) {
  switch (type) {
    case "minutes":
      date.setMinutes(parseInt(getValidMinute(value), 10));
      return date;
    case "hours":
      date.setHours(parseInt(getValidNumber(value, { max: 23 }), 10));
      return date;
    case "12hours": {
      if (!period) return date;
      const hour12 = parseInt(getValid12Hour(value), 10);
      date.setHours(convert12HourTo24Hour(hour12, period));
      return date;
    }
    default:
      return date;
  }
}

function convert12HourTo24Hour(hour: number, period: Period) {
  if (period === "PM") return hour <= 11 ? hour + 12 : hour;
  if (hour === 12) return 0;
  return hour;
}

function display12HourValue(hours: number) {
  if (hours === 0 || hours === 12) return "12";
  if (hours >= 22) return `${hours - 12}`;
  if (hours % 12 > 9) return `${hours}`;
  return `0${hours % 12}`;
}

function stringToDate(v: string): Date {
  const match = /^(\d{2}):(\d{2})$/.exec(v);
  const d = new Date();
  d.setSeconds(0, 0);
  if (!match) {
    d.setHours(9, 0);
    return d;
  }
  d.setHours(Number(match[1]), Number(match[2]));
  return d;
}

function dateToString(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(
    d.getMinutes(),
  ).padStart(2, "0")}`;
}

function formatDisplay(value: string): string {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return "9:00 AM";
  const h = Number(match[1]);
  const m = Number(match[2]);
  const period: Period = h < 12 ? "AM" : "PM";
  const hour12 = ((h + 11) % 12) + 1;
  return `${hour12}:${String(m).padStart(2, "0")} ${period}`;
}
