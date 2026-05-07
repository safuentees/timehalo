"use client";

import { useMemo } from "react";
import { useFormatter, useTranslations } from "next-intl";
import useEmblaCarousel from "embla-carousel-react";
import { isOpenSlot, isTakenSlot, type Slot } from "@/lib/availability";

type Props = {
  date: Date;
  slots: Slot[];
  onPick: (slot: Slot) => void;
  selectedSlot?: Slot;
};

type BandId = "morning" | "afternoon" | "evening";
type Band = { id: BandId; slots: Slot[] };

export function DaySlots({ date, slots, onPick, selectedSlot }: Props) {
  const t = useTranslations("BookingCalendar");
  const bands = useMemo(() => bucketByTimeOfDay(slots), [slots]);
  const openCount = slots.filter(isOpenSlot).length;
  const bandLabels: Record<BandId, string> = {
    morning: t("bandMorning"),
    afternoon: t("bandAfternoon"),
    evening: t("bandEvening"),
  };

  return (
    <section
      className="oh-day-slots"
      aria-label={t("slotsOnAria", { date: date.toDateString() })}
    >
      {slots.length === 0 ? (
        <p className="oh-day-slots-empty">{t("dayClosed")}</p>
      ) : (
        <>
          {openCount === 0 ? (
            <p className="oh-day-slots-note">{t("dayAllTaken")}</p>
          ) : null}
          <div className="oh-day-slots-bands">
            {bands.map((band) =>
              band.slots.length > 0 ? (
                <TimeBand
                  key={band.id}
                  band={band}
                  label={bandLabels[band.id]}
                  onPick={onPick}
                  selectedSlot={selectedSlot}
                />
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
  label,
  onPick,
  selectedSlot,
}: {
  band: Band;
  label: string;
  onPick: (slot: Slot) => void;
  selectedSlot?: Slot;
}) {
  const [emblaRef] = useEmblaCarousel({
    align: "start",
    dragFree: false,
    containScroll: "keepSnaps",
    skipSnaps: true,
  });

  return (
    <div className="oh-time-band">
      <span className="oh-kicker oh-time-band-kicker">{label}</span>
      <div className="oh-time-band-chips" ref={emblaRef}>
        <div className="oh-time-band-chips-track">
          {band.slots.map((s) => (
            <div key={s.start} className="oh-time-band-chip-slide">
              <SlotChip
                slot={s}
                onPick={onPick}
                isSelected={selectedSlot?.start === s.start}
              />
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
  isSelected = false,
}: {
  slot: Slot;
  onPick: (slot: Slot) => void;
  isSelected?: boolean;
}) {
  const t = useTranslations("BookingCalendar");
  const format = useFormatter();
  const start = new Date(slot.start);
  const timeLabel = format.dateTime(start, {
    hour: "numeric",
    minute: "2-digit",
  });

  if (isTakenSlot(slot)) {
    return (
      <button
        type="button"
        disabled
        aria-disabled="true"
        className="oh-slot-chip oh-slot-chip--taken"
        aria-label={t("slotTakenAria", { time: timeLabel })}
      >
        <span>{timeLabel}</span>
        <span className="oh-slot-chip-badge">{t("slotTakenBadge")}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      className="oh-slot-chip"
      onClick={() => onPick(slot)}
      aria-label={t("slotBookAria", { time: timeLabel })}
      aria-pressed={isSelected}
    >
      {timeLabel}
    </button>
  );
}

function bucketByTimeOfDay(slots: Slot[]): Band[] {
  const bands: Band[] = (["morning", "afternoon", "evening"] as const).map(
    (id) => ({ id, slots: [] }),
  );
  for (const s of slots) {
    const h = new Date(s.start).getHours();
    const idx = h < 12 ? 0 : h < 17 ? 1 : 2;
    bands[idx].slots.push(s);
  }
  return bands;
}
