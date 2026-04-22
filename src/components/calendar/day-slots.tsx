"use client";

import { useMemo, useState } from "react";
import type { Slot } from "@/lib/availability";

type Props = {
  date: Date;
  slots: Slot[];
  onPick?: (slot: Slot) => void;
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
    <section className="bru-day-slots" aria-label={`Slots on ${date.toDateString()}`}>
      <header className="bru-day-slots-head">
        <span className="bru-kicker">PICK A TIME</span>
        <span className="bru-day-slots-date">
          {date
            .toLocaleDateString(undefined, {
              weekday: "short",
              month: "short",
              day: "numeric",
            })
            .toUpperCase()}
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

function TimeBand({ band, onPick }: { band: Band; onPick?: (slot: Slot) => void }) {
  const [expanded, setExpanded] = useState(false);
  const collapseAt = 5;
  const collapsed = !expanded && band.slots.length > collapseAt;
  const visible = collapsed ? band.slots.slice(0, 4) : band.slots;
  const hidden = collapsed ? band.slots.length - visible.length : 0;

  return (
    <div className="bru-time-band">
      <span className="bru-kicker bru-time-band-kicker">{band.label}</span>
      <div className="bru-slot-chips">
        {visible.map((s) => (
          <SlotChip key={s.start} slot={s} onPick={onPick} />
        ))}
        {collapsed ? (
          <button
            type="button"
            className="bru-slot-chip bru-slot-chip-more"
            onClick={() => setExpanded(true)}
          >
            + {hidden} more
          </button>
        ) : null}
      </div>
    </div>
  );
}

function SlotChip({ slot, onPick }: { slot: Slot; onPick?: (slot: Slot) => void }) {
  const start = new Date(slot.start);
  return (
    <button
      type="button"
      className="bru-slot-chip"
      onClick={() => (onPick ? onPick(slot) : console.log("slot", slot))}
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
