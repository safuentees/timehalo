"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeftIcon, CalendarIcon, CheckIcon, CopyIcon } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button, buttonVariants } from "@/components/ui/button";
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
  const slotDate = startDate.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  const slotTime = `${fmtTime(startDate)} — ${fmtTime(endDate)}`;
  const durationMinutes = Math.max(
    15,
    Math.round((endDate.getTime() - startDate.getTime()) / 60_000),
  );
  const tzLabel = getTimeZoneLabel();
  const summaryText = [
    `Office hours with ${hostName}`,
    `${slotDate}`,
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
        setTransientShareState("shared");
        return;
      }

      await navigator.clipboard.writeText(`${summaryText}\n${window.location.href}`);
      setTransientShareState("copied");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }
    }
  }

  return (
    <div className="min-h-dvh">
      <div className="bru-topbar">
        <div className="flex items-center gap-3">
          <div className="bru-monogram">OH</div>
          <div>
            <div className="bru-topbar-title">
              OFFICE HOURS · /h/{booking.host.handle}
            </div>
            <div className="bru-topbar-sub">BOOKING RECEIPT</div>
          </div>
        </div>
      </div>

      <main className="bru-confirm-main">
        <section className="bru-confirm-hero bru-reveal">
          <div className="bru-confirm-mark" aria-hidden>
            <CheckIcon />
          </div>
          <span className="bru-profile-kicker">SLOT LOCKED IN</span>
          <h1 className="bru-confirm-title text-balance">
            You&apos;re booked with {hostName}.
          </h1>
          <p className="bru-confirm-body text-pretty">
            Your time is saved. Add it to your calendar now or bookmark this
            page so the details stay easy to reach on mobile.
          </p>
          <div className="bru-confirm-ref">
            <span>REFERENCE</span>
            <strong>{booking.publicUid}</strong>
          </div>
        </section>

        <section className="bru-confirm-grid">
          <article className="bru-confirm-card bru-reveal">
            <span className="bru-profile-kicker">WHEN</span>
            <div className="bru-confirm-value tabular-nums">{slotDate}</div>
            <div className="bru-confirm-meta tabular-nums">{slotTime}</div>
            <p className="bru-confirm-note text-pretty">
              {tzLabel} · {durationMinutes} MIN
            </p>
          </article>

          <article className="bru-confirm-card bru-reveal">
            <span className="bru-profile-kicker">HOST</span>
            <div className="bru-confirm-host">
              <Avatar size="lg" className="bru-profile-avatar bru-confirm-avatar">
                <AvatarImage
                  src={booking.host.image ?? undefined}
                  alt={hostName}
                  className="rounded-(--bru-r-sm)"
                />
                <AvatarFallback className="rounded-(--bru-r-sm) bg-(--bru-paper) text-(color:--bru-ink) font-[family-name:var(--bru-mono)] text-[16px] font-extrabold">
                  {toInitials(hostName)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="bru-confirm-host-name text-balance">{hostName}</p>
                <p className="bru-confirm-note">/h/{booking.host.handle}</p>
              </div>
            </div>
          </article>

          <article className="bru-confirm-card bru-confirm-card-wide bru-reveal">
            <span className="bru-profile-kicker">WHAT HAPPENS NEXT</span>
            <ul className="bru-confirm-list text-pretty">
              <li>This slot is already reserved on the schedule.</li>
              <li>Save it to your calendar so it does not get buried.</li>
              <li>
                If you come back later, this page still works as your booking
                receipt.
              </li>
            </ul>
          </article>

          <section className="bru-confirm-actions bru-reveal" aria-label="Booking actions">
            <a
              href={`/api/bookings/${booking.publicUid}/calendar`}
              className={cn(
                buttonVariants({
                  variant: "brutalist",
                  size: "brutalist",
                }),
                "bru-confirm-action"
              )}
            >
              <CalendarIcon />
              ADD TO CALENDAR
            </a>

            <Button
              type="button"
              variant="brutalistGhost"
              size="brutalist"
              className="bru-confirm-action"
              onClick={handleShare}
            >
              <CopyIcon />
              {shareState === "idle"
                ? "SHARE DETAILS"
                : shareState === "shared"
                  ? "SHARED"
                  : "COPIED"}
            </Button>

            <Link
              href={`/h/${booking.host.handle}`}
              className={cn(
                buttonVariants({
                  variant: "brutalistGhost",
                  size: "brutalist",
                }),
                "bru-confirm-action"
              )}
            >
              <ArrowLeftIcon />
              BACK TO HOST PAGE
            </Link>
          </section>
        </section>
      </main>
    </div>
  );

  function setTransientShareState(nextState: "shared" | "copied") {
    setShareState(nextState);
    window.setTimeout(() => {
      setShareState("idle");
    }, 1800);
  }
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
