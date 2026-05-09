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
import { Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DURATION_MAX_MINUTES,
  DURATION_MIN_MINUTES,
} from "@/lib/durations";

// Popover-based duration picker — minimal layout.
//
// Single minutes field (no hour split — easier to type "120" than to
// pick "2hr 0min"). Auto-commits on close so there's no Save button
// crowding the popover. Remove is a small trash icon in the corner.
// The trigger is whatever the caller supplies — a chip for an
// existing duration, a `+` icon button for the add affordance.
//
// Lifecycle:
//   • Open    — popover anchors to trigger; field re-seeds from
//               initialMinutes (or 30 default for add).
//   • Type    — field updates draft state, sets dirty flag.
//   • Close   — outside-click / Escape / Remove icon. If dirty AND
//               value is in [5, 480] AND not a duplicate, fire
//               onCommit. Otherwise discard.
//   • Remove  — trash icon (edit mode only). Wraps `<Popover.Close>`
//               so the click auto-dismisses; calls onRemove async.
//
// Width: input uses `field-sizing: content` (modern CSS, supported
// in Chrome/Edge 124+, Safari 17.4+, Firefox 123+) so values >99
// extend the field naturally. Falls back to a fixed width on older
// browsers via the explicit `min-w` floor.

// No SEED_MINUTES default — when the picker opens for "Add" with no
// initial value, the field starts EMPTY (draft = null) so the user
// types the duration they want without a placeholder number to
// delete first. Same for the edit path: clearing the field leaves
// draft = null, which fails the commit-on-close range check, so the
// existing chip value stays.

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
   *  Used to silently skip commit on duplicate. */
  existingMinutes?: ReadonlyArray<number>;
  labels: {
    minuteSuffix: string;
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

  // Draft state — only mutated by user input. Re-seeded on every
  // OPEN event in onOpenChange so the field reflects the chip's
  // current saved value at the moment the user clicks. `null`
  // represents "field is empty" — the user has cleared the input
  // mid-typing OR the picker just opened in Add mode with no seed.
  // Empty draft fails the range check in maybeCommitOnClose, which
  // is the desired no-op behavior.
  const [draft, setDraft] = useState<number | null>(
    initialMinutes ?? null,
  );
  const [dirty, setDirty] = useState(false);

  // Latest draft mirrored into refs so the close handler can read
  // the freshest value. Without this, `onOpenChange(false)` would
  // see the stale closure of `draft` captured at the last render
  // and commit the OLD value when the user types then clicks
  // outside. Effects (not render-time assignment) per React 19's
  // "no ref writes during render" rule.
  const draftRef = useRef(draft);
  const dirtyRef = useRef(dirty);
  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);
  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);

  function maybeCommitOnClose() {
    if (!dirtyRef.current) return;
    const value = draftRef.current;
    if (value === null) return;
    const inRange =
      value >= DURATION_MIN_MINUTES && value <= DURATION_MAX_MINUTES;
    if (!inRange) return;
    if (existingMinutes.includes(value)) return;
    if (mode === "edit" && initialMinutes === value) return;
    void onCommit(value);
  }

  return (
    <Popover.Root
      onOpenChange={(next) => {
        if (next) {
          // Re-seed on open. Event-handler form (not effect) so
          // React 19's `set-state-in-effect` rule doesn't fire.
          // `null` → empty field on Add mode; in Edit mode the
          // current chip value seeds the input.
          setDraft(initialMinutes ?? null);
          setDirty(false);
          // Auto-focus the input on open so the user can immediately
          // type a new value.
          requestAnimationFrame(() => inputRef.current?.focus());
        } else {
          maybeCommitOnClose();
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
                onChange={(next) => {
                  setDraft(next);
                  setDirty(true);
                }}
              />
              <span className="oh-eyebrow opacity-55">
                {labels.minuteSuffix}
              </span>
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
}

const DurationField = forwardRef<HTMLInputElement, DurationFieldProps>(
  ({ value, onChange }, ref) => {
    function clamp(n: number) {
      if (Number.isNaN(n)) return DURATION_MIN_MINUTES;
      if (n < 0) return 0; // allow 0 mid-typing; range is enforced on commit
      if (n > DURATION_MAX_MINUTES) return DURATION_MAX_MINUTES;
      return n;
    }

    function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
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
        onChange={(e) => {
          const raw = e.target.value;
          // Empty input stays empty — `null` is the "user is mid-typing
          // / has cleared the field" sentinel. Previously this branch
          // wrote `0`, which forced a literal "0" placeholder into the
          // input the user then had to delete before typing the real
          // value. Now the field reads as truly empty.
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
          // Override the time-picker-input's fixed 48px width — single-
          // field duration picker auto-grows with the digit count via
          // CSS field-sizing. min width keeps a comfortable tap target
          // even on a one-digit value.
          "w-auto !min-w-[64px] !px-3",
        )}
        style={{ fieldSizing: "content" } as React.CSSProperties}
      />
    );
  },
);

DurationField.displayName = "DurationField";
