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

const SEED_MINUTES = 30;

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

  const [draft, setDraft] = useState<number>(initialMinutes ?? SEED_MINUTES);
  const [dirty, setDirty] = useState(false);

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
          setDraft(initialMinutes ?? SEED_MINUTES);
          setDirty(false);
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

interface DurationFieldProps {
  value: number;
  onChange: (next: number) => void;
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
        const next = clamp(value + 5 * direction);
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
        value={Number.isFinite(value) ? value : ""}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === "") {
            onChange(0);
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
          "w-auto !min-w-[64px] !px-3",
        )}
        style={{ fieldSizing: "content" } as React.CSSProperties}
      />
    );
  },
);

DurationField.displayName = "DurationField";
