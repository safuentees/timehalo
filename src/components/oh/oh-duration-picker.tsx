"use client";

import {
  forwardRef,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { Popover } from "@base-ui/react/popover";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useResponsiveModalPortalContainer } from "@/components/ui/responsive-modal";
import {
  DURATION_MAX_MINUTES,
  DURATION_MIN_MINUTES,
} from "@/lib/durations";

const HOUR_MAX = Math.floor(DURATION_MAX_MINUTES / 60); // 8
const MINUTE_STEP = 5;
const MINUTE_MAX = 55;

export type OhDurationPickerProps = {
  initialMinutes?: number;
  mode: "add" | "edit";
  onCommit: (minutes: number) => Promise<void> | void;
  onRemove?: () => Promise<void> | void;
  isPending?: boolean;
  children: ReactNode;
  disabled?: boolean;
  duplicateMessage?: string;
  existingMinutes?: ReadonlyArray<number>;
  labels: {
    hourLabel: string; // "Hours"
    minuteLabel: string; // "Minutes"
    addAction: string; // "Add duration"
    saveAction: string; // "Save"
    removeAction: string; // "Remove"
    rangeError: string; // "Use a number between 5 and 480 minutes."
    duplicateError: string; // "That duration is already on your list."
  };
};

export function OhDurationPicker({
  initialMinutes,
  mode,
  onCommit,
  onRemove,
  isPending = false,
  children,
  disabled,
  existingMinutes = [],
  labels,
}: OhDurationPickerProps) {
  const reactId = useId();
  const portalContainer = useResponsiveModalPortalContainer();

  const [open, setOpen] = useState(false);

  const seedMinutes = initialMinutes ?? 30;
  const [hours, setHours] = useState(() => Math.floor(seedMinutes / 60));
  const [minutes, setMinutes] = useState(() => seedMinutes % 60);

  const totalMinutes = hours * 60 + minutes;
  const inRange =
    totalMinutes >= DURATION_MIN_MINUTES &&
    totalMinutes <= DURATION_MAX_MINUTES;
  const isDuplicate = existingMinutes.includes(totalMinutes);
  const error = !inRange
    ? labels.rangeError
    : isDuplicate
      ? labels.duplicateError
      : null;
  const canCommit = error === null && !isPending;

  const hourRef = useRef<HTMLInputElement>(null);
  const minuteRef = useRef<HTMLInputElement>(null);

  async function handleCommit() {
    if (!canCommit) return;
    try {
      await onCommit(totalMinutes);
      setOpen(false);
    } catch {
    }
  }

  async function handleRemove() {
    if (!onRemove || isPending) return;
    try {
      await onRemove();
      setOpen(false);
    } catch {
    }
  }

  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        if (!next && isPending) return;
        if (next) {
          const seed = initialMinutes ?? 30;
          setHours(Math.floor(seed / 60));
          setMinutes(seed % 60);
        }
        setOpen(next);
      }}
    >
      <Popover.Trigger
        id={`oh-duration-picker-${reactId}`}
        disabled={disabled}
        render={children as React.ReactElement}
      />
      <Popover.Portal container={portalContainer}>
        <Popover.Positioner
          className="oh-time-picker-positioner"
          sideOffset={8}
          align="start"
          style={{ zIndex: 100 }}
        >
          <Popover.Popup className="oh-time-picker-popup">
            <div className="flex flex-col gap-3">
              <div className="flex items-end gap-2">
                <FieldStack labelText={labels.hourLabel}>
                  <DurationSpinner
                    ref={hourRef}
                    field="hours"
                    value={hours}
                    onChange={setHours}
                    onRightFocus={() => minuteRef.current?.focus()}
                  />
                </FieldStack>
                <span
                  aria-hidden
                  className="select-none self-end pb-2 text-[18px] font-black opacity-55"
                >
                  :
                </span>
                <FieldStack labelText={labels.minuteLabel}>
                  <DurationSpinner
                    ref={minuteRef}
                    field="minutes"
                    value={minutes}
                    onChange={setMinutes}
                    onLeftFocus={() => hourRef.current?.focus()}
                  />
                </FieldStack>
              </div>

              {error ? (
                <p
                  role="alert"
                  className="rounded-(--oh-r-xs) bg-[color-mix(in_srgb,var(--oh-ink)_8%,var(--oh-paper))] px-2.5 py-1.5 font-[family-name:var(--oh-mono)] text-[10px] font-extrabold tracking-[1.5px] uppercase opacity-65"
                >
                  {error}
                </p>
              ) : null}

              <div
                className={cn(
                  "flex items-center gap-2",
                  onRemove ? "justify-between" : "justify-end",
                )}
              >
                {onRemove ? (
                  <Button
                    type="button"
                    variant="ohGhost"
                    size="oh"
                    onClick={handleRemove}
                    disabled={isPending}
                    className="rounded-(--oh-r-xs)"
                  >
                    {labels.removeAction}
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="oh"
                  size="oh"
                  onClick={handleCommit}
                  disabled={!canCommit}
                  className="rounded-(--oh-r-xs)"
                >
                  {mode === "add" ? labels.addAction : labels.saveAction}
                </Button>
              </div>
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

type SpinnerField = "hours" | "minutes";

interface DurationSpinnerProps {
  field: SpinnerField;
  value: number;
  onChange: (next: number) => void;
  onRightFocus?: () => void;
  onLeftFocus?: () => void;
}

const DurationSpinner = forwardRef<HTMLInputElement, DurationSpinnerProps>(
  ({ field, value, onChange, onRightFocus, onLeftFocus }, ref) => {
    const max = field === "hours" ? HOUR_MAX : MINUTE_MAX;
    const step = field === "hours" ? 1 : MINUTE_STEP;
    const display = String(value).padStart(2, "0");

    const [flag, setFlag] = useState(false);
    useEffect(() => {
      if (!flag) return;
      const t = setTimeout(() => setFlag(false), 2000);
      return () => clearTimeout(t);
    }, [flag]);

    function clampForField(n: number) {
      if (Number.isNaN(n)) return 0;
      if (n < 0) return 0;
      if (n > max) return max;
      return n;
    }

    function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
      if (e.key === "Tab") return;
      e.preventDefault();
      if (e.key === "ArrowRight") onRightFocus?.();
      if (e.key === "ArrowLeft") onLeftFocus?.();
      if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        const direction = e.key === "ArrowUp" ? 1 : -1;
        let next = value + step * direction;
        if (next < 0) next = max;
        if (next > max) next = 0;
        if (flag) setFlag(false);
        onChange(next);
        return;
      }
      if (e.key >= "0" && e.key <= "9") {
        const digit = Number(e.key);
        const candidate = flag ? Number(display.slice(1) + e.key) : digit;
        const clamped = clampForField(candidate);
        const aligned =
          field === "minutes" ? Math.round(clamped / step) * step : clamped;
        if (flag) onRightFocus?.();
        setFlag((prev) => !prev);
        onChange(aligned);
      }
    }

    return (
      <input
        ref={ref}
        type="tel"
        inputMode="numeric"
        value={display}
        onChange={(e) => e.preventDefault()}
        onKeyDown={handleKeyDown}
        aria-label={field === "hours" ? "Hours" : "Minutes"}
        className="oh-time-picker-input"
      />
    );
  },
);

DurationSpinner.displayName = "DurationSpinner";
