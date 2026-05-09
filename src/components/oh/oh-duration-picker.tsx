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

// Popover-based duration picker. Mirrors `<OhTimePicker>`'s shape
// (popover anchored to a chip-style trigger, recessed-paper spinner
// inputs side-by-side) but operates on a single integer (minutes),
// not a Date. Two spinners — hours (0..8) and minutes (0..55, step 5)
// — let the host express "1 hr 15 min" or "30 min" naturally without
// imposing a 12-hour-clock mental model.
//
// Replaces the prior ResponsiveModal drawer pattern in
// `<DurationFields>`. Click closes-on-outside (Base UI Popover
// default) so the chip itself is the trigger; a primary button in
// the popover footer commits the change. Edit mode also surfaces a
// Remove ghost button in the same footer row.
//
// Shared CSS classes pulled from `oh-time-picker-*` so the popover
// chrome + spinner vocabulary is a single source of truth across
// the dashboard's two pickers.

const HOUR_MAX = Math.floor(DURATION_MAX_MINUTES / 60); // 8
const MINUTE_STEP = 5;
const MINUTE_MAX = 55;

export type OhDurationPickerProps = {
  /**
   * Initial minutes value. For edit mode pass the chip's current
   * value; for add mode pass undefined and the picker opens at
   * 30min as a sensible starting point.
   */
  initialMinutes?: number;
  /**
   * Picker mode — drives the footer's primary button label and the
   * presence of the Remove button.
   */
  mode: "add" | "edit";
  /** Async commit. Returning a rejected promise leaves the popover open. */
  onCommit: (minutes: number) => Promise<void> | void;
  /** Optional remove handler (edit mode only). */
  onRemove?: () => Promise<void> | void;
  /** True while a parent mutation is in flight — disables footer buttons + close. */
  isPending?: boolean;
  /**
   * Trigger content — rendered INSIDE `<Popover.Trigger>` (which
   * itself is a `<button>`). Mirrors `<OhTimePicker>`'s pattern of
   * letting the caller compose the trigger's inner spans + icons
   * while Base UI owns the button element + click/keyboard wiring.
   */
  triggerContent: ReactNode;
  /** Class names applied to the `<button>` rendered by Popover.Trigger. */
  triggerClassName?: string;
  /** Optional aria-label for the trigger button. */
  triggerAriaLabel?: string;
  /** Disabled state on the trigger. */
  disabled?: boolean;
  /** Set of existing minutes values (excluding the one being edited)
   *  used for client-side duplicate detection before commit. */
  existingMinutes?: ReadonlyArray<number>;
  /** Localized strings — caller passes them so the picker stays
   *  i18n-agnostic. */
  labels: {
    hourLabel: string;
    minuteLabel: string;
    addAction: string;
    saveAction: string;
    removeAction: string;
    rangeError: string;
    duplicateError: string;
  };
};

export function OhDurationPicker({
  initialMinutes,
  mode,
  onCommit,
  onRemove,
  isPending = false,
  triggerContent,
  triggerClassName,
  triggerAriaLabel,
  disabled,
  existingMinutes = [],
  labels,
}: OhDurationPickerProps) {
  const reactId = useId();
  const portalContainer = useResponsiveModalPortalContainer();

  // `<Popover.Root>` runs UNCONTROLLED — same as `<OhTimePicker>`
  // ships. When the Root was controlled (open + onOpenChange), the
  // trigger's click handler still fired but the popover failed to
  // appear because the controlled state propagation skipped a beat
  // somewhere in Base UI's internal store. Reverting to uncontrolled
  // matches the working time-picker exactly.
  //
  // For programmatic close (Save / Remove path), we hold an
  // `actionsRef` so the commit handlers can call `actions.close()`
  // after the async mutation resolves.
  const actionsRef = useRef<Popover.Root.Actions | null>(null);

  // Picker draft is kept LOCAL to the popover so closing without
  // committing discards any unsaved changes. Lazy initializer seeds
  // from initialMinutes (or 30 default) on first mount; the
  // onOpenChange handler below re-seeds on every subsequent open
  // event so the values reflect the chip's current saved state at
  // the moment the user clicks (event-driven, not effect-driven —
  // dodges React 19's `react-hooks/set-state-in-effect` rule).
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
      actionsRef.current?.close();
    } catch {
      // Parent mutation hook toasted; keep popover open so the
      // host can adjust + retry.
    }
  }

  async function handleRemove() {
    if (!onRemove || isPending) return;
    try {
      await onRemove();
      actionsRef.current?.close();
    } catch {
      // Same as commit — keep open on error.
    }
  }

  return (
    <Popover.Root
      actionsRef={actionsRef}
      onOpenChange={(next) => {
        // Re-seed draft on open so the picker reflects the chip's
        // current saved state. Event-handler form so React 19's
        // `react-hooks/set-state-in-effect` rule doesn't fire.
        if (next) {
          const seed = initialMinutes ?? 30;
          setHours(Math.floor(seed / 60));
          setMinutes(seed % 60);
        }
      }}
    >
      <Popover.Trigger
        id={`oh-duration-picker-${reactId}`}
        disabled={disabled}
        className={triggerClassName}
        aria-label={triggerAriaLabel}
      >
        {triggerContent}
      </Popover.Trigger>
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

// ─── Field wrapper (mirrors OhTimePicker.FieldStack) ────────────────

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

// ─── Number-based spinner (simpler than OhTimePicker's Date-based one)
//
// One field role per instance — "hours" steps by 1 and clamps at 0..8,
// "minutes" steps by MINUTE_STEP (5) and clamps at 0..55. Two-digit
// flag matches OhTimePicker's grace window — type the first digit,
// type the second within 2s to land at a 2-digit value, otherwise
// the next digit press starts a fresh value.

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
        // Loop at boundaries — same vibe as OhTimePicker: tap up at
        // max wraps to 0, tap down at 0 wraps to max.
        if (next < 0) next = max;
        if (next > max) next = 0;
        if (flag) setFlag(false);
        onChange(next);
        return;
      }
      if (e.key >= "0" && e.key <= "9") {
        // Two-digit grace window: first digit replaces, second digit
        // appends within the 2s flag window. After the window the
        // next press starts a fresh single-digit value.
        const digit = Number(e.key);
        const candidate = flag ? Number(display.slice(1) + e.key) : digit;
        const clamped = clampForField(candidate);
        // Snap minutes to the step grid on direct entry too — keeps
        // the value parseable by `bookings.create` without surprises.
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
