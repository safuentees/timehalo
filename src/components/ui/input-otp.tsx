"use client";

import * as React from "react";
import { OTPInput, OTPInputContext } from "input-otp";
import { Minus } from "lucide-react";

import { cn } from "@/lib/utils";

// Project-styled wrapper around `input-otp`. Anatomy mirrors the
// canonical `shadcn-ui/ui` source so children → Provider → context
// → slot wiring stays predictable; chrome is project-specific.
//
// Slots are STROKELESS — depth comes from the same inset-shadow
// recess `.oh-input` uses (`--oh-input-shadow-rest` at idle,
// `--oh-focus-shadow-input` on the active slot). Same vocabulary as
// the rest of the form fields, so the OTP row reads as part of the
// same input family rather than a chrome breakaway.
//
// When empty, each slot renders the placeholder char ("0" by default)
// at low opacity so the user can SEE there are 6 boxes waiting for
// input — without placeholders the recessed-paper rectangles read as
// decorative since they have no border. Pass `placeholder="000000"`
// from the consumer (or any 6-char string) to set the chars.

function InputOTP({
  className,
  containerClassName,
  ...props
}: React.ComponentProps<typeof OTPInput> & {
  containerClassName?: string;
}) {
  return (
    <OTPInput
      data-slot="input-otp"
      // `justify-center` so the slot row is centered within whatever
      // column width the form gives it. Override per-callsite via
      // `containerClassName="..."` if a left-aligned variant is
      // needed.
      containerClassName={cn(
        "flex w-full items-center justify-center gap-2 has-disabled:opacity-50",
        containerClassName,
      )}
      className={cn("disabled:cursor-not-allowed", className)}
      {...props}
    />
  );
}

function InputOTPGroup({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="input-otp-group"
      className={cn("flex items-center gap-2", className)}
      {...props}
    />
  );
}

function InputOTPSlot({
  index,
  className,
  ...props
}: React.ComponentProps<"div"> & {
  index: number;
}) {
  const inputOTPContext = React.useContext(OTPInputContext);
  const { char, hasFakeCaret, isActive, placeholderChar } =
    inputOTPContext?.slots[index] ?? {};

  // Show placeholder only when no char is typed. Reduced opacity so
  // the "0" reads as a hint, not real input.
  const showPlaceholder = char === null || char === undefined;

  return (
    <div
      data-slot="input-otp-slot"
      data-active={isActive}
      // Strokeless paper recess. The inset shadow is the visual
      // boundary — matches `.oh-input` + the visitor booking form's
      // borderless inputs. Sized 56h × 48w so 6 slots fit in a 320px
      // viewport (8 + 6*48 + 5*8 = 344) with the auth-column
      // padding to spare; visually heftier than the prior 1px-stroke
      // version, easier to tap on mobile.
      className={cn(
        "relative flex h-14 w-12 items-center justify-center rounded-(--oh-r-xs) bg-[color:var(--oh-paper)] text-[22px] font-semibold leading-none tabular-nums text-[color:var(--oh-ink)] shadow-[var(--oh-input-shadow-rest)] outline-none transition-[box-shadow,background-color] duration-150 ease-oh",
        // Active slot — same focus chrome as `.oh-input:focus`: bg
        // lifts to the focus tint, shadow deepens.
        "data-[active=true]:bg-[var(--oh-input-bg-focus)] data-[active=true]:shadow-[var(--oh-focus-shadow-input)]",
        // Aria-invalid — destructive-token inset stroke. Active +
        // invalid composes both shadows so the user can still see
        // which slot has focus while the row is errored.
        "aria-invalid:shadow-[inset_0_0_0_1.5px_var(--destructive)] data-[active=true]:aria-invalid:shadow-[inset_0_0_0_1.5px_var(--destructive),var(--oh-focus-shadow-input)]",
        className,
      )}
      {...props}
    >
      {showPlaceholder ? (
        // Dim placeholder char ("0" by default). 30% opacity reads
        // as "this is a hint, not your input" on both light + dark
        // theme without needing per-mode tuning.
        <span aria-hidden className="opacity-30">
          {placeholderChar ?? null}
        </span>
      ) : (
        char
      )}
      {hasFakeCaret && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="h-6 w-px animate-caret-blink bg-[color:var(--oh-ink)]" />
        </div>
      )}
    </div>
  );
}

function InputOTPSeparator({ ...props }: React.ComponentProps<"div">) {
  return (
    <div data-slot="input-otp-separator" role="separator" {...props}>
      <Minus className="size-4 opacity-55" strokeWidth={1.75} />
    </div>
  );
}

export { InputOTP, InputOTPGroup, InputOTPSlot, InputOTPSeparator };
