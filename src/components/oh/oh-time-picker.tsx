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

// Custom oh-themed time picker. Replaces the previous opacity-0
// `<input type="time">` overlay that worked on iOS Safari but not on
// desktop browsers (Chrome / Firefox / Safari desktop don't open a
// picker on container click — only on the calendar-picker-indicator
// pseudo-element, which is unreliably positioned).
//
// Pattern adapted from OpenStatus's `time-picker`
// (github.com/openstatusHQ/time-picker — the de-facto shadcn time
// picker). Keyboard-first spinner inputs: type digits, arrow up/down
// to step (with 15-min step on minutes), arrow left/right to move
// between fields. Auto-advance from hours → minutes after the second
// digit. Wrap-around at boundaries (12↔1 hour, 45↔00 minute).
//
// Shape: still the card trigger (eyebrow + bold time + chevron)
// users tap to reveal the popover. Inside the popover, three small
// fields side-by-side: hour, minute, AM/PM. Compact (~180px wide),
// keyboard-fast on desktop, numeric-keyboard on mobile.
//
// Internal value contract stays "HH:MM" 24-hour string to match the
// availability schema; we convert to Date at the boundary because
// OpenStatus's spinner inputs are Date-based and that math is what's
// already battle-tested upstream.

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

  const date = useMemo(() => stringToDate(value), [value]);
  const setDate = (next: Date | undefined) => {
    if (!next) return;
    onChange(dateToString(next));
  };

  // Period is derived from `date.getHours()`, no local state — the
  // upstream value is the single source of truth. Toggling AM↔PM
  // via the segmented toggle below calls `setDate` directly with
  // the converted hours, which round-trips back through the value
  // prop and re-derives period on the next render.
  const period: Period = date.getHours() >= 12 ? "PM" : "AM";

  const hourRef = useRef<HTMLInputElement>(null);
  const minuteRef = useRef<HTMLInputElement>(null);

  // When the picker is rendered inside a ResponsiveModal (mobile
  // drawer or desktop dialog), the popover must portal INTO the
  // modal's content so it stays inside the focus-trap / inert
  // scope. Two distinct mechanisms make a body-portaled popover
  // unclickable, both fixed by the same target-into-modal portal:
  //
  //   - Mobile (vaul Drawer): `pointer-events: none` is applied
  //     to body siblings while the drawer is open. Body-portaled
  //     popover registers as an outside-click; drawer eats it.
  //
  //   - Desktop (Base UI Dialog with modal=true, the default):
  //     Dialog wraps its popup in `FloatingFocusManager` from
  //     `@floating-ui/react` which marks every element OUTSIDE
  //     the floating tree with `inert`. Verified in
  //     `@base-ui/react/dialog/popup/DialogPopup.js:117`
  //     (`modal: modal !== false`). Body-portaled popover is a
  //     sibling of the dialog's portal → gets inert'd → clicks
  //     no-op, popup never opens. (Earlier code assumed desktop
  //     was fine; user reported the chip-click bug on /settings
  //     availability dialog and the source check confirmed.)
  //
  // Returns null outside a ResponsiveModal, falling through to
  // Base UI's default body portal — correct behavior there.
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
          // Inline z-index: dialog/drawer hosting the picker has its
          // own stacking context; same belt-and-suspenders the
          // workspace switcher menu uses (oh-dashboard-bar.tsx).
          style={{ zIndex: 100 }}
        >
          <Popover.Popup className="oh-time-picker-popup">
            {/* `items-end` — the row anchors children at the bottom
                so the input + AM/PM track baselines align under
                their labels. Heights match because both read the
                shared `--oh-time-picker-control-h` token (36px) —
                no flex-grow propagation chain needed. */}
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
                    // OpenStatus pattern: re-set the date with the
                    // 12-hour value held but the new period applied,
                    // so AM↔PM swap lands at the right 24-hour value.
                    // No local state to sync — period derives from
                    // date on the next render.
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

// ─── Field wrapper ──────────────────────────────────────────────────

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

// ─── AM/PM toggle (segmented, not native select) ────────────────────
// Two-button segmented toggle is more compact for the popover and
// fits the brutalist chrome better than a dropdown — same vibe as
// the existing tab-strip pattern on /bookings.

function PeriodToggle({
  period,
  onChange,
}: {
  period: Period;
  onChange: (next: Period) => void;
}) {
  // B.PT296 — replaces the bespoke `.oh-time-picker-period` CSS
  // segmented control with the canonical `<OhPillSwitcher>`. AM/PM
  // is structurally a 2-option segmented switcher, so it inherits
  // the same paper-pill-on-muted-track aesthetic as the bookings
  // view-mode switcher: muted-paper inset track, paper sliding
  // pill via motion's `layoutId`, Apple-HIG concentric corners.
  // Single design vocabulary across every segmented control in the
  // app — view-mode switcher, list-view tab bar, day strip, AM/PM.
  return (
    <OhPillSwitcher
      ariaLabel="AM or PM"
      value={period}
      onChange={onChange}
      // B.PT297 — height pulled from the shared
      // `--oh-time-picker-control-h` CSS variable (36px) which
      // `.oh-time-picker-input` also reads. Single source of truth
      // for the popup's control row.
      // Tailwind v4 shorthand `h-(--name)` is used instead of the
      // bracket-form alternative — Tailwind's CSS parser raises a
      // build error on the bracket form combined with the `!`
      // important modifier (the parser fails to extract the var
      // name from inside the bracket). The shorthand is the v4
      // canonical way to reference a CSS variable in an arbitrary
      // utility (per `tailwindcss.com/docs/adding-custom-styles`).
      // The `!` modifier itself is required to beat shadcn's
      // `group-data-horizontal/tabs:h-8` variant on TabsList,
      // which has higher CSS specificity than a plain utility and
      // would otherwise lock the track at 32px.
      // B.PT298 — softened inset shadow at this callsite
      // (`!shadow-[inset_0_3px_10px_rgba(0,0,0,0.16)]` overrides the
      // OhPillSwitcher default's 0.22 opacity). The popup is on a
      // smaller surface than the bookings page, so 0.22 read too
      // heavy here; 0.16 is calibrated to feel like the same recess
      // metaphor at smaller scale.
      className="!h-(--oh-time-picker-control-h) !shadow-[inset_0_3px_10px_rgba(0,0,0,0.16)]"
      options={[
        { value: "AM", label: "AM" },
        { value: "PM", label: "PM" },
      ]}
    />
  );
}

// ─── Spinner input (OpenStatus pattern, adapted) ────────────────────
// Type digits to set; ArrowUp/Down to step (15-min for minutes,
// 1-hour for hours, looping at boundaries); ArrowLeft/Right to move
// between fields. The `flag` two-digit grace window is verbatim
// from OpenStatus — gives the user 2 seconds to enter a second
// digit before the field resets to single-digit input.

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
      // 12-hour first-digit "0" → expect 1-9 next; if user types
      // 1 then waits, the 2nd digit can shift to 10/11/12.
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
        // Read-only at the change-event level (we drive value via
        // keyDown). onChange is required for controlled inputs;
        // preventing default mirrors OpenStatus's behavior.
        onChange={(e) => e.preventDefault()}
        onKeyDown={handleKeyDown}
        aria-label={picker === "12hours" ? "Hour" : picker}
        className="oh-time-picker-input"
      />
    );
  },
);

OhTimePickerInput.displayName = "OhTimePickerInput";

// ─── Utils (adapted from OpenStatus's time-picker-utils.ts) ─────────

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
      // Minute arrow steps land on the 15-min grid: snap current
      // value to nearest grid point first, then add ±15. Keeps the
      // sequence tidy even if the user typed a non-grid value.
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

// ─── String ↔ Date adapter ──────────────────────────────────────────
// The form schema stores availability as "HH:MM" 24-hour strings;
// OpenStatus's spinners are Date-based. Convert at the boundary.

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
