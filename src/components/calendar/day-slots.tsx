"use client";

import { useMemo } from "react";
import useEmblaCarousel from "embla-carousel-react";
import type { Slot } from "@/lib/availability";

type Props = {
  date: Date;
  slots: Slot[];
  onPick: (slot: Slot) => void;
};

type BandId = "morning" | "afternoon" | "evening";
type Band = { id: BandId; label: string; slots: Slot[] };

const BAND_LABELS: Record<BandId, string> = {
  morning: "MORNING",
  afternoon: "AFTERNOON",
  evening: "EVENING",
};

export function DaySlots({ date, slots, onPick }: Props) {
  const bands = useMemo(() => bucketByTimeOfDay(slots), [slots]);

  return (
    <section
      className="bru-day-slots"
      aria-label={`Slots on ${date.toDateString()}`}
    >
      <header className="bru-day-slots-head">
        <span className="bru-kicker">PICK A TIME</span>
        <span className="bru-day-slots-date">
          {fmtSlotHeader(date, slots.length)}
        </span>
      </header>
      {slots.length === 0 ? (
        <p className="bru-day-slots-empty">closed ·</p>
      ) : (
        <div className="bru-day-slots-bands">
          {bands.map((band) =>
            band.slots.length > 0 ? (
              <TimeBand key={band.id} band={band} onPick={onPick} />
            ) : null,
          )}
        </div>
      )}
    </section>
  );
}

function TimeBand({
  band,
  onPick,
}: {
  band: Band;
  onPick: (slot: Slot) => void;
}) {
  const [emblaRef] = useEmblaCarousel({
    align: () => 20,
    dragFree: false,
    containScroll: "trimSnaps",
    skipSnaps: true,
  });

  return (
    <div className="bru-time-band">
      <span className="bru-kicker bru-time-band-kicker">{band.label}</span>
      <div className="bru-time-band-chips" ref={emblaRef}>
        <div className="bru-time-band-chips-track">
          {band.slots.map((s) => (
            <SlotChip key={s.start} slot={s} onPick={onPick} />
          ))}
        </div>
      </div>
    </div>
  );
}

function SlotChip({
  slot,
  onPick,
}: {
  slot: Slot;
  onPick: (slot: Slot) => void;
}) {
  const start = new Date(slot.start);
  return (
    <button
      type="button"
      className="bru-slot-chip"
      onClick={() => onPick(slot)}
      aria-label={`Book ${start.toLocaleTimeString()}`}
    >
      {start.toLocaleTimeString(undefined, {
        hour: "numeric",
        minute: "2-digit",
      })}
    </button>
  );
}

function bucketByTimeOfDay(slots: Slot[]): Band[] {
  const bands: Band[] = (["morning", "afternoon", "evening"] as const).map(
    (id) => ({ id, label: BAND_LABELS[id], slots: [] }),
  );
  for (const s of slots) {
    const h = new Date(s.start).getHours();
    const idx = h < 12 ? 0 : h < 17 ? 1 : 2;
    bands[idx].slots.push(s);
  }
  return bands;
}

function fmtSlotHeader(date: Date, count: number): string {
  const prefix = date
    .toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
    })
    .toUpperCase();
  if (count === 0) return `${prefix} · CLOSED`;
  const suffix = `${count.toString().padStart(2, "0")} ${count === 1 ? "SLOT" : "SLOTS"}`;
  return `${prefix} · ${suffix}`;
}
