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

export type OhDurationPickerProps = {
  initialMinutes?: number;
  mode: "add" | "edit";
  onCommit: (minutes: number) => Promise<void> | void;
  onRemove?: () => Promise<void> | void;
  triggerContent: ReactNode;
  triggerClassName?: string;
  triggerAriaLabel?: string;
  disabled?: boolean;
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

  const [open, setOpen] = useState(false);

  const [draft, setDraft] = useState<number | null>(
    initialMinutes ?? null,
  );

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
          setDraft(initialMinutes ?? null);
          requestAnimationFrame(() => inputRef.current?.focus());
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

interface DurationFieldProps {
  value: number | null;
  onChange: (next: number | null) => void;
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
          "!w-auto !min-w-[64px] !pl-3 !pr-6 !text-left",
        )}
        style={{ fieldSizing: "content" } as React.CSSProperties}
      />
    );
  },
);

DurationField.displayName = "DurationField";
