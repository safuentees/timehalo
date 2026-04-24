"use client";

import { useMemo } from "react";
import useEmblaCarousel from "embla-carousel-react";
import { isOpenSlot, isTakenSlot, type Slot } from "@/lib/availability";

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

/**
 * Slot chips grouped by time-of-day for a single selected date. Each band
 * is a horizontal Embla carousel — dragFree with snap, no +N-more collapse.
 */
export function DaySlots({ date, slots, onPick }: Props) {
  const bands = useMemo(() => bucketByTimeOfDay(slots), [slots]);
  const openCount = slots.filter(isOpenSlot).length;

  return (
    <section
      className="bru-day-slots"
      aria-label={`Slots on ${date.toDateString()}`}
    >
      {slots.length === 0 ? (
        <p className="bru-day-slots-empty">closed ·</p>
      ) : (
        <>
          {openCount === 0 ? (
            <p className="bru-day-slots-note">
              No open times left on this day. These slots are already taken.
            </p>
          ) : null}
          <div className="bru-day-slots-bands">
            {bands.map((band) =>
              band.slots.length > 0 ? (
                <TimeBand key={band.id} band={band} onPick={onPick} />
              ) : null,
            )}
          </div>
        </>
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
    // Embla's docs recommend keeping containScroll enabled so the last
    // snap clamps to the scrollable end instead of aligning the final
    // chip to the viewport start and leaving empty space on the right.
    // We preserve the 20px edge inset in CSS by baking it into the
    // first/last slide padding rather than viewport padding.
    align: "start",
    dragFree: false,
    containScroll: "keepSnaps",
    skipSnaps: true,
  });

  return (
    <div className="bru-time-band">
      <span className="bru-kicker bru-time-band-kicker">{band.label}</span>
      <div className="bru-time-band-chips" ref={emblaRef}>
        <div className="bru-time-band-chips-track">
          {band.slots.map((s) => (
            <div key={s.start} className="bru-time-band-chip-slide">
              <SlotChip slot={s} onPick={onPick} />
            </div>
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
  const timeLabel = start.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });

  if (isTakenSlot(slot)) {
    return (
      <div className="bru-slot-chip bru-slot-chip--taken" aria-label={`${timeLabel}, taken`}>
        <span>{timeLabel}</span>
        <span className="bru-slot-chip-badge">TAKEN</span>
      </div>
    );
  }

  return (
    <button
      type="button"
      className="bru-slot-chip"
      onClick={() => onPick(slot)}
      aria-label={`Book ${timeLabel}`}
    >
      {timeLabel}
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
