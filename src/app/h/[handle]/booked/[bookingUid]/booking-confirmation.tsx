"use client";

import { useState } from "react";
import { Link } from "next-view-transitions";
import { CalendarIcon, CheckIcon } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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
    <div className="min-h-dvh bg-bru-bg text-bru-content">
      <header className="flex items-center justify-between border-b-[1.5px] border-bru-line px-5 py-4">
        <Link
          href="/"
          className="font-[family-name:var(--bru-mono)] text-[11px] font-extrabold tracking-[2.5px] uppercase transition-opacity hover:opacity-55"
        >
          OH
        </Link>
        {booking.host.handle ? (
          <Link
            href={`/h/${booking.host.handle}`}
            className="font-[family-name:var(--bru-mono)] text-[11px] font-extrabold tracking-[2.5px] uppercase opacity-55 transition-opacity hover:opacity-100"
          >
            /h/{booking.host.handle}
          </Link>
        ) : null}
      </header>

      <main className="mx-auto w-full max-w-[440px] px-5 pt-10 pb-16 sm:pt-16">
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className="grid size-7 place-items-center rounded-(--bru-r-xs) border-[1.5px] border-bru-content bg-bru-content text-bru-bg"
          >
            <CheckIcon className="size-4" strokeWidth={3} />
          </span>
          <span className="font-[family-name:var(--bru-mono)] text-[11px] font-extrabold tracking-[2.5px] uppercase opacity-55">
            Booked
          </span>
        </div>

        <div className="mt-10">
          <p className="font-[family-name:var(--bru-mono)] text-[11px] font-extrabold tracking-[2.5px] uppercase opacity-55">
            {weekday}
          </p>
          <p className="mt-2 text-[clamp(40px,12vw,72px)] font-black leading-[0.92] tracking-[-0.04em] uppercase">
            {monthDay}
          </p>
          <p className="mt-4 font-[family-name:var(--bru-mono)] text-[16px] font-bold tabular-nums">
            {slotTime}
          </p>
          <p className="mt-1 font-[family-name:var(--bru-mono)] text-[10px] font-extrabold tracking-[2px] uppercase opacity-55">
            {tzLabel}
          </p>
        </div>

        <div className="mt-10 flex items-center gap-3 border-t-[1.5px] border-bru-line pt-6">
          <Avatar className="size-10 rounded-(--bru-r-xs)">
            <AvatarImage
              src={booking.host.image ?? undefined}
              alt={hostName}
              className="rounded-(--bru-r-xs)"
            />
            <AvatarFallback className="rounded-(--bru-r-xs) bg-bru-paper font-[family-name:var(--bru-mono)] text-[12px] font-extrabold text-bru-ink">
              {toInitials(hostName)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-bold leading-tight">
              with {hostName}
            </p>
            {booking.host.handle ? (
              <p className="mt-0.5 truncate font-[family-name:var(--bru-mono)] text-[10px] font-extrabold tracking-[1.5px] uppercase opacity-55">
                /h/{booking.host.handle}
              </p>
            ) : null}
          </div>
        </div>

        <a
          href={`/api/bookings/${booking.publicUid}/calendar`}
          className={cn(
            buttonVariants({ variant: "brutalist", size: "brutalist" }),
            "mt-8 w-full justify-center gap-2",
          )}
        >
          <CalendarIcon />
          Add to calendar
        </a>

        <div className="mt-6 flex items-center justify-between gap-4 font-[family-name:var(--bru-mono)] text-[10px] font-extrabold tracking-[2px] uppercase">
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
          <span className="truncate opacity-40">#{booking.publicUid}</span>
        </div>
      </main>
    </div>
  );
}

function fmtTime(date: Date): string {
  return date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
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
