"use client";

import { useEffect, useState } from "react";
import { CalendarIcon, Clock3Icon } from "lucide-react";
import { trpc } from "@/trpc/hooks";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { AvailabilityDrawer, TriggerCard } from "@/components/calendar";
import type { Slot } from "@/lib/availability";

type Props = { handle: string };

export default function HostProfile({ handle }: Props) {
  const { data: user } = trpc.users.getByHandle.useQuery({ handle });
  const { data: slots = [] } = trpc.schedule.getUpcomingSlots.useQuery({
    handle,
  });
  const nextSlot = slots[0] as Slot | undefined;
  const visitorTz = useVisitorTz();
  useReadyClass();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const [selectedSlot, setSelectedSlot] = useState<Slot | undefined>();

  if (!user) return null;

  const displayName = user.name ?? user.handle ?? "Host";
  const initials = toInitials(displayName);

  return (
    <main className="bru-main" id="top">
      <div className="bru-topbar">
        <div className="flex items-center gap-3">
          <div className="bru-monogram">OH</div>
          <div>
            <div className="bru-topbar-title">
              OFFICE HOURS · /h/{user.handle}
            </div>
            <div className="bru-topbar-sub">
              PUBLIC PROFILE · BOOK A 15-MIN SLOT
            </div>
          </div>
        </div>
      </div>

      <section className="bru-profile-hero bru-reveal">
        <div className="bru-profile-hero-inner">
          <Avatar size="lg" className="bru-profile-avatar">
            <AvatarImage
              src={user.image ?? undefined}
              alt={displayName}
              className="rounded-none"
            />
            <AvatarFallback className="rounded-none bg-(--bru-paper) text-(color:--bru-ink) font-[family-name:var(--bru-mono)] text-[18px] font-extrabold tracking-[2px]">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="bru-profile-meta">
            <div className="bru-profile-kicker">OFFICE HOURS</div>
            <h1 className="bru-profile-name">{displayName}</h1>
            <p className="bru-profile-bio">
              Book a short conversation — writing, software, or whatever&apos;s
              been rattling around your head lately.
            </p>
            <div className="bru-profile-badges">
              <Badge variant="outline" className="bru-profile-badge">
                <Clock3Icon data-icon="inline-start" />
                15 MIN
              </Badge>
              <Badge variant="outline" className="bru-profile-badge">
                {slots.length.toString().padStart(2, "0")} SLOTS · 7 DAYS
              </Badge>
              <Badge variant="outline" className="bru-profile-badge">
                {visitorTz} · [TZ TBD]
              </Badge>
            </div>
          </div>
        </div>
      </section>

      <section className="bru-profile-cta">
        {nextSlot ? <NextAvailable slot={nextSlot} /> : null}

        {slots.length === 0 ? (
          <HostEmpty displayName={displayName} />
        ) : (
          <>
            <TriggerCard
              selectedDate={selectedDate}
              selectedSlot={selectedSlot}
              onClick={() => setDrawerOpen(true)}
            />
            <AvailabilityDrawer
              slots={slots}
              open={drawerOpen}
              onOpenChange={setDrawerOpen}
              selectedDate={selectedDate}
              onSelectDate={setSelectedDate}
              onPickSlot={(s) => {
                setSelectedSlot(s);
                setDrawerOpen(false);
              }}
              initialPhase={selectedDate ? "time" : "date"}
            />
          </>
        )}
      </section>

      <div className="bru-endrule">
        <span>— END · PICK A DATE ABOVE —</span>
        <span>/h/{user.handle}</span>
      </div>
    </main>
  );
}

function HostEmpty({ displayName }: { displayName: string }) {
  return (
    <div className="bru-profile-empty">
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <CalendarIcon />
          </EmptyMedia>
          <EmptyTitle>No slots this week</EmptyTitle>
          <EmptyDescription>
            {displayName} hasn&apos;t opened any time yet. Check back later.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    </div>
  );
}

function NextAvailable({ slot }: { slot: Slot }) {
  const startDate = new Date(slot.start);
  return (
    <section className="bru-next-available bru-reveal" aria-label="Next available slot">
      <span className="bru-next-available-kicker">NEXT AVAILABLE</span>
      <div className="bru-next-available-body">
        <span className="bru-next-available-time">{fmtTime(startDate)}</span>
        <span className="bru-next-available-meta">
          {fmtDayLabelShort(startDate)} · {fmtRelative(startDate)}
        </span>
      </div>
    </section>
  );
}

function fmtDayLabelShort(d: Date): string {
  const weekday = d
    .toLocaleDateString(undefined, { weekday: "short" })
    .toUpperCase();
  return `${weekday} ${d.getDate()}`;
}

function fmtTime(d: Date): string {
  return d.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function fmtRelative(d: Date): string {
  const now = new Date();
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  );
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round(
    (target.getTime() - startOfToday.getTime()) / 86_400_000,
  );
  if (diffDays === 0) return "TODAY";
  if (diffDays === 1) return "TOMORROW";
  return `IN ${diffDays} DAYS`;
}

function toInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((s) => s[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function useVisitorTz(): string {
  const [tz, setTz] = useState("—");
  useEffect(() => {
    try {
      const zone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
      const tail = zone.split("/").pop() ?? zone;
      setTz(tail.replace(/_/g, " ").toUpperCase() || "—");
    } catch {
      setTz("—");
    }
  }, []);
  return tz;
}

function useReadyClass() {
  useEffect(() => {
    document.body.classList.add("bru-ready");
  }, []);
}
