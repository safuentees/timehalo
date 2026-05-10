"use client";

import * as React from "react";
import { OTPInput, OTPInputContext } from "input-otp";
import { Minus } from "lucide-react";

import { cn } from "@/lib/utils";

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

  const showPlaceholder = char === null || char === undefined;

  return (
    <div
      data-slot="input-otp-slot"
      data-active={isActive}
      className={cn(
        "relative flex h-14 w-12 items-center justify-center rounded-(--oh-r-xs) bg-[color:var(--oh-paper)] text-[22px] font-semibold leading-none tabular-nums text-[color:var(--oh-ink)] shadow-[var(--oh-input-shadow-rest)] outline-none transition-[box-shadow,background-color] duration-150 ease-oh",
        "data-[active=true]:bg-[var(--oh-input-bg-focus)] data-[active=true]:shadow-[var(--oh-focus-shadow-input)]",
        "aria-invalid:shadow-[inset_0_0_0_1.5px_var(--destructive)] data-[active=true]:aria-invalid:shadow-[inset_0_0_0_1.5px_var(--destructive),var(--oh-focus-shadow-input)]",
        className,
      )}
      {...props}
    >
      {showPlaceholder ? (
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
