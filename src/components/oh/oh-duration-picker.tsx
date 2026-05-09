"use client";

import {
  forwardRef,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { Popover } from "@base-ui/react/popover";
import { Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DURATION_MAX_MINUTES,
  DURATION_MIN_MINUTES,
} from "@/lib/durations";

// Popover-based duration picker — minimal layout.
//
// Single minutes field (no hour split — easier to type "120" than to
// pick "2hr 0min"). Save is explicit via a Plus icon button to the
// right of the MIN suffix; the popover does NOT auto-commit on close
// (clicking outside or pressing Escape discards the draft, same as
// any modal-edit form).
//
// Trigger is whatever the caller supplies — a chip for an existing
// duration, a `+` icon button for the add affordance.
//
// Lifecycle:
//   • Open    — popover anchors to trigger; field re-seeds from
//               initialMinutes. Add-mode draft = null (empty), but
//               the input renders `placeholder="0"` so the user sees
//               a faded zero hint that disappears on the first
//               keystroke (native browser behavior). Edit-mode
//               draft = current chip value.
//   • Type    — field updates draft state.
//   • Save    — Plus icon click OR Enter key. Both call onCommit
//               with the validated value, then close the popover.
//               Disabled when value is empty / out of range /
//               duplicate / unchanged-from-edit.
//   • Cancel  — outside-click / Escape. Discards draft. The user
//               must press Plus (or Enter) to persist.
//   • Remove  — trash icon (edit mode only). Wraps `<Popover.Close>`
//               so the click auto-dismisses; calls onRemove async.
//
// Width: input uses `field-sizing: content` (modern CSS, supported
// in Chrome/Edge 124+, Safari 17.4+, Firefox 123+) so values >99
// extend the field naturally. Falls back to a fixed width on older
// browsers via the explicit `min-w` floor.

export type OhDurationPickerProps = {
  initialMinutes?: number;
  mode: "add" | "edit";
  onCommit: (minutes: number) => Promise<void> | void;
  onRemove?: () => Promise<void> | void;
  triggerContent: ReactNode;
  triggerClassName?: string;
  triggerAriaLabel?: string;
  disabled?: boolean;
  /** Existing minutes values (excluding the chip being edited).
   *  Used to disable the Save button on duplicate. */
  existingMinutes?: ReadonlyArray<number>;
  labels: {
    minuteSuffix: string;
    saveAria: string;
    removeAria: string;
  };
};

export function OhDurationPicker({
  initialMinutes,
  mode,
  onCommit,
  onRemove,
  triggerContent,
  triggerClassName,
  triggerAriaLabel,
  disabled,
  existingMinutes = [],
  labels,
}: OhDurationPickerProps) {
  const reactId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const saveBtnRef = useRef<HTMLButtonElement>(null);

  // Controlled open state so the Enter-key handler in the input can
  // close the popover after committing. Uncontrolled would force us
  // to programmatically click the save button via ref to trigger
  // Popover.Close — controlled is the cleaner shape.
  const [open, setOpen] = useState(false);

  // Draft state — only mutated by user input. Re-seeded on every
  // OPEN event in onOpenChange so the field reflects the chip's
  // current saved value at the moment the user clicks. `null`
  // represents "field is empty" — Add mode initial OR user cleared
  // the input mid-typing.
  const [draft, setDraft] = useState<number | null>(
    initialMinutes ?? null,
  );

  // Save-button enabled when draft is a valid, non-duplicate, actual
  // change. Same gate the Enter-key handler reads.
  const canSave =
    draft !== null &&
    draft >= DURATION_MIN_MINUTES &&
    draft <= DURATION_MAX_MINUTES &&
    !existingMinutes.includes(draft) &&
    !(mode === "edit" && initialMinutes === draft);

  function handleSave() {
    if (!canSave || draft === null) return;
    void onCommit(draft);
    setOpen(false);
  }

  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          // Re-seed on open. Event-handler form (not effect) so
          // React 19's `set-state-in-effect` rule doesn't fire.
          // `null` → empty field with `placeholder="0"` on Add mode;
          // in Edit mode the current chip value seeds the input.
          setDraft(initialMinutes ?? null);
          // Auto-focus the input on open so the user can immediately
          // type. Native `<input type="number">` placeholder shows
          // until the first keystroke, then disappears (browser
          // default — no JS needed).
          requestAnimationFrame(() => inputRef.current?.focus());
        }
        // Close path is intentionally a no-op for committing — explicit
        // save via the Plus button (or Enter key) is the only path
        // that persists the draft.
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
      <Popover.Portal>
        <Popover.Positioner
          className="oh-time-picker-positioner"
          sideOffset={8}
          align="start"
          style={{ zIndex: 100 }}
        >
          <Popover.Popup className="oh-duration-picker-popup">
            <div className="flex items-center gap-3">
              <DurationField
                ref={inputRef}
                value={draft}
                onChange={(next) => setDraft(next)}
                onSubmit={() => saveBtnRef.current?.click()}
              />
              <span className="oh-eyebrow opacity-55">
                {labels.minuteSuffix}
              </span>
              <button
                ref={saveBtnRef}
                type="button"
                onClick={handleSave}
                disabled={!canSave}
                aria-label={labels.saveAria}
                className="oh-duration-picker-remove"
              >
                <Plus strokeWidth={1.75} className="size-4" aria-hidden />
              </button>
              {onRemove ? (
                <Popover.Close
                  onClick={() => void onRemove()}
                  aria-label={labels.removeAria}
                  className="oh-duration-picker-remove"
                >
                  <Trash2 strokeWidth={1.75} className="size-4" aria-hidden />
                </Popover.Close>
              ) : null}
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

// ─── Number field ──────────────────────────────────────────────────
// Native `<input type="number">` styled like the time picker's
// spinner inputs. Arrow up/down step by 5 (covers the typical
// 5/15/30/60/90 cadence). field-sizing: content auto-grows the
// width as the visitor types past 99 — modern CSS spec, supported
// in Chrome 124+, Safari 17.4+, Firefox 123+.

interface DurationFieldProps {
  value: number | null;
  onChange: (next: number | null) => void;
  /** Fired on Enter — the parent dispatches a click on the save
   *  button so the same code path persists the draft and closes
   *  the popover. */
  onSubmit: () => void;
}

const DurationField = forwardRef<HTMLInputElement, DurationFieldProps>(
  ({ value, onChange, onSubmit }, ref) => {
    function clamp(n: number) {
      if (Number.isNaN(n)) return DURATION_MIN_MINUTES;
      if (n < 0) return 0; // allow 0 mid-typing; range is enforced on commit
      if (n > DURATION_MAX_MINUTES) return DURATION_MAX_MINUTES;
      return n;
    }

    function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
      if (e.key === "Enter") {
        e.preventDefault();
        onSubmit();
        return;
      }
      if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        e.preventDefault();
        const direction = e.key === "ArrowUp" ? 1 : -1;
        // Empty field — arrow up starts at MIN, arrow down stays empty
        // (down from nothing is a no-op).
        const baseline = value ?? (direction === 1 ? 0 : null);
        if (baseline === null) return;
        const next = clamp(baseline + 5 * direction);
        onChange(next);
      }
    }

    return (
      <input
        ref={ref}
        type="number"
        inputMode="numeric"
        min={0}
        max={DURATION_MAX_MINUTES}
        step={5}
        value={value !== null && Number.isFinite(value) ? value : ""}
        // Single "0" placeholder rather than "00" — minutes are
        // variable-width (5, 30, 120 are all valid) so a 2-digit
        // hint would lie about the format. Native browser placeholder
        // behavior: shows until the first keystroke, disappears as
        // the user types — no JS clearing needed.
        placeholder="0"
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === "") {
            onChange(null);
            return;
          }
          const parsed = Number(raw);
          if (!Number.isFinite(parsed)) return;
          onChange(clamp(Math.round(parsed)));
        }}
        onKeyDown={handleKeyDown}
        aria-label="Duration in minutes"
        className={cn(
          "oh-time-picker-input tabular-nums",
          // Overrides over the inherited `.oh-time-picker-input` rules.
          //
          // `!w-auto` — base class sets `width: 48px` as **unlayered
          // CSS**, which per the Cascade Layers spec beats any rule
          // in `@layer utilities` (including Tailwind's `w-auto`)
          // regardless of specificity. The `!` prefix forces
          // !important so the layered utility wins. Combined with
          // the inline `fieldSizing: content` below, the input then
          // auto-grows with digit count instead of being pinned at
          // 48px (which made longer values overflow behind the MIN
          // suffix and spinner).
          //
          // `!text-left` — base class centers (correct for the time
          // picker's HH/MM spinners), but the duration field is a
          // variable-width single value (5, 30, 120, 480). Centered
          // text grows in BOTH directions; with the native number-
          // input spinner sitting at the right edge of the box, the
          // rightward growth overlaps the spinner's hit area —
          // user reported "the number goes behind the increaser."
          // Left-aligned text grows rightward only, into the padding
          // reserve below.
          //
          // `!pl-3 !pr-6` — asymmetric padding. 12px left for the
          // first digit's breathing room. 24px right reserves space
          // for the native number-input spinner (~16-22px wide
          // depending on browser) so digits never reach the spinner's
          // hit zone.
          //
          // `!min-w-[64px]` — comfortable tap target even on a one-
          // digit value. Field-sizing only grows past this floor.
          "!w-auto !min-w-[64px] !pl-3 !pr-6 !text-left",
        )}
        style={{ fieldSizing: "content" } as React.CSSProperties}
      />
    );
  },
);

DurationField.displayName = "DurationField";
