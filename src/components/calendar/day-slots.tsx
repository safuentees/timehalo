"use client";

import { useMemo } from "react";
import { useFormatter, useTranslations } from "next-intl";
import useEmblaCarousel from "embla-carousel-react";
import { isOpenSlot, isTakenSlot, type Slot } from "@/lib/availability";

type Props = {
  date: Date;
  slots: Slot[];
  onPick: (slot: Slot) => void;
};

type BandId = "morning" | "afternoon" | "evening";
type Band = { id: BandId; slots: Slot[] };

/**
 * Slot chips grouped by time-of-day for a single selected date. Each band
 * is a horizontal Embla carousel — dragFree with snap, no +N-more collapse.
 *
 * B.PT91 — band labels resolved per-render via `useTranslations` so an
 * es-locale visitor sees Mañana/Tarde/Noche. Uppercase styling stays in
 * CSS (`oh-kicker text-transform: uppercase`).
 */
export function DaySlots({ date, slots, onPick }: Props) {
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
}: {
  band: Band;
  label: string;
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
    <div className="oh-time-band">
      <span className="oh-kicker oh-time-band-kicker">{label}</span>
      <div className="oh-time-band-chips" ref={emblaRef}>
        <div className="oh-time-band-chips-track">
          {band.slots.map((s) => (
            <div key={s.start} className="oh-time-band-chip-slide">
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
  const t = useTranslations("BookingCalendar");
  const format = useFormatter();
  const start = new Date(slot.start);
  const timeLabel = format.dateTime(start, {
    hour: "numeric",
    minute: "2-digit",
  });

  if (isTakenSlot(slot)) {
    // B.PT234 — taken slots use a real <button disabled> instead of
    // a non-interactive <div>. Native HTML `disabled` + ARIA both
    // communicate "not selectable" to assistive tech and keyboard
    // users, and CSS can target `:disabled` for state styling. The
    // visible "TAKEN" badge stays as the human-readable cue.
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
