"use client";

import { useState } from "react";
import { Link } from "next-view-transitions";
import { CalendarIcon, CheckIcon } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Post-booking receipt. Apple HIG redesign: communicate the result,
// don't decorate around it. The date is the focal element — everything
// else exists to confirm it.
//
// Mobile-first scale, then expand:
//   • Column max-w grows 440 → 560 → 680 across breakpoints so the
//     receipt has presence on a 27" monitor without becoming a wall
//     on a 6" phone.
//   • Date type uses clamp(48px, 14vw, 160px) — billboard-scale on
//     desktop, still readable at 320px width. Same single typographic
//     system, no breakpoint-specific layout swap.
//   • Padding scales (px-5 → px-8 → px-12 / py-12 → py-20 → py-28)
//     so the receipt earns its room instead of floating in vast empty
//     space on big monitors. Pattern matches cal.com / Granola: keep
//     the receipt narrow, let the canvas around it fill in.
//   • A footer band runs across the bottom — gives the page a
//     finished edge on desktop where the receipt would otherwise
//     trail off into white. Skipped on mobile (the receipt extends
//     to the bottom anyway, footer would just push content up).

type BookingConfirmationProps = {
  booking: {
    publicUid: string;
    slotStart: Date | string;
    slotEnd: Date | string;
    host: {
      name: string | null;
      handle: string | null;
      image: string | null;
    };
  };
};

export function BookingConfirmation({ booking }: BookingConfirmationProps) {
  const [shareState, setShareState] = useState<"idle" | "shared" | "copied">(
    "idle",
  );

  const hostName = booking.host.name ?? booking.host.handle ?? "Host";
  const startDate = new Date(booking.slotStart);
  const endDate = new Date(booking.slotEnd);
  const weekday = startDate.toLocaleDateString(undefined, { weekday: "long" });
  const monthDay = startDate
    .toLocaleDateString(undefined, { month: "long", day: "numeric" })
    .toUpperCase();
  const slotTime = `${fmtTime(startDate)} – ${fmtTime(endDate)}`;
  const tzLabel = getTimeZoneLabel();
  const summaryText = [
    `Office hours with ${hostName}`,
    weekday + ", " + monthDay,
    `${slotTime} (${tzLabel})`,
    `Reference ${booking.publicUid}`,
  ].join("\n");

  async function handleShare() {
    try {
      if (navigator.share) {
        await navigator.share({
          title: `Office hours with ${hostName}`,
          text: summaryText,
          url: window.location.href,
        });
        flashShareState("shared");
        return;
      }
      await navigator.clipboard.writeText(
        `${summaryText}\n${window.location.href}`,
      );
      flashShareState("copied");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
    }
  }

  function flashShareState(next: "shared" | "copied") {
    setShareState(next);
    window.setTimeout(() => setShareState("idle"), 1800);
  }

  return (
    <div className="flex min-h-dvh flex-col bg-bru-bg text-bru-content">
      <header className="flex items-center justify-between border-b-[1.5px] border-bru-line px-5 py-4 sm:px-8 sm:py-5 lg:px-12">
        <Link
          href="/"
          className="font-[family-name:var(--bru-mono)] text-[11px] font-extrabold tracking-[2.5px] uppercase decoration-bru-content underline-offset-4 transition-[text-decoration] hover:underline"
        >
          OH
        </Link>
        {booking.host.handle ? (
          <Link
            href={`/h/${booking.host.handle}`}
            className="bru-legend transition-opacity hover:opacity-100"
          >
            /h/{booking.host.handle}
          </Link>
        ) : null}
      </header>

      <main className="flex-1">
        <div className="mx-auto w-full max-w-[440px] px-5 py-12 sm:max-w-[560px] sm:px-8 sm:py-20 lg:max-w-[680px] lg:px-12 lg:py-28">
          <div className="flex items-center gap-3">
            <span
              aria-hidden
              className="grid size-7 place-items-center rounded-(--bru-r-xs) border-[1.5px] border-bru-content bg-bru-content text-bru-bg sm:size-8"
            >
              <CheckIcon className="size-4 sm:size-[18px]" strokeWidth={3} />
            </span>
            <span className="bru-legend sm:text-[12px]">
              Booked
            </span>
          </div>

          <div className="mt-10 sm:mt-14 lg:mt-20">
            <p className="bru-legend sm:text-[13px]">
              {weekday}
            </p>
            <p className="mt-2 text-[clamp(48px,14vw,160px)] font-black leading-[0.88] tracking-[-0.045em] uppercase sm:mt-3">
              {monthDay}
            </p>
            <p className="mt-4 font-[family-name:var(--bru-mono)] text-[16px] font-bold tabular-nums sm:mt-6 sm:text-[18px] lg:text-[20px]">
              {slotTime}
            </p>
            <p className="mt-1 bru-eyebrow sm:text-[11px]">
              {tzLabel}
            </p>
          </div>

          <div className="mt-10 flex items-center gap-3 border-t-[1.5px] border-bru-line pt-6 sm:mt-14 sm:gap-4 sm:pt-8 lg:mt-20">
            <Avatar className="size-10 rounded-(--bru-r-xs) sm:size-12">
              <AvatarImage
                src={booking.host.image ?? undefined}
                alt={hostName}
                className="rounded-(--bru-r-xs)"
              />
              <AvatarFallback className="rounded-(--bru-r-xs) bg-bru-paper font-[family-name:var(--bru-mono)] text-[12px] font-extrabold text-bru-ink sm:text-[14px]">
                {toInitials(hostName)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-bold leading-tight sm:text-[17px]">
                with {hostName}
              </p>
              {booking.host.handle ? (
                <p className="mt-0.5 truncate bru-eyebrow sm:text-[11px]">
                  /h/{booking.host.handle}
                </p>
              ) : null}
            </div>
          </div>

          <a
            href={`/api/bookings/${booking.publicUid}/calendar`}
            className={cn(
              buttonVariants({ variant: "brutalist", size: "brutalist" }),
              // Size bumps only; the brutalist variant owns the paired
              // background/text colors for stale and hover states.
              "mt-8 w-full justify-center gap-2 sm:mt-10 sm:h-11 lg:h-12",
            )}
          >
            <CalendarIcon />
            Add to calendar
          </a>

          <div className="mt-6 flex items-center justify-between gap-4 font-[family-name:var(--bru-mono)] text-[10px] font-extrabold tracking-[2px] uppercase sm:mt-8 sm:text-[11px]">
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={handleShare}
                className="opacity-55 transition-opacity hover:opacity-100"
              >
                {shareState === "idle"
                  ? "Share"
                  : shareState === "shared"
                    ? "Shared"
                    : "Copied"}
              </button>
              {/* A9 — Reschedule entry point. Routes to the host's
                  picker with `?reschedule=<bookingUid>`; the picker
                  reads the param, pre-populates the original slot,
                  and switches the slot click into a confirm-style
                  reschedule. The procedure carries the visitor's
                  identity over via the original Booking row, so no
                  re-entered form fields. */}
              {booking.host.handle ? (
                <Link
                  href={`/h/${booking.host.handle}?reschedule=${booking.publicUid}`}
                  className="opacity-55 transition-opacity hover:opacity-100"
                >
                  Reschedule
                </Link>
              ) : null}
            </div>
            <span className="truncate opacity-40">#{booking.publicUid}</span>
          </div>
        </div>
      </main>

      <footer className="hidden items-center justify-between border-t-[1.5px] border-bru-line px-8 py-5 bru-eyebrow sm:flex lg:px-12">
        <span>Officehours</span>
        <span className="tabular-nums">Receipt {fmtStamp(startDate)}</span>
      </footer>
    </div>
  );
}

function fmtTime(date: Date): string {
  return date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function fmtStamp(date: Date): string {
  // Compact ISO-style stamp for the desktop footer — gives the receipt
  // a finished bottom edge without competing with the hero date.
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getTimeZoneLabel(): string {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
    const tail = zone.split("/").pop() ?? zone;
    return tail.replace(/_/g, " ").toUpperCase() || "LOCAL TIME";
  } catch {
    return "LOCAL TIME";
  }
}

function toInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}
