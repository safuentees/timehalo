"use client";

import { useEffect, useMemo } from "react";
import useEmblaCarousel from "embla-carousel-react";
import { addDays, isSameDay, startOfWeek } from "date-fns";
import {
  computeDensityMap,
  startOfToday,
  toKey,
  type Slot,
} from "@/lib/availability";

const DAYS_PER_WEEK = 7;

type Props = {
  slots: Slot[];
  selectedDate: Date | undefined;
  onSelectDate: (d: Date) => void;
  spanDays?: number;
};

/**
 * Horizontal day strip — the default drawer view. 60 days forward from today,
 * Embla snaps each cell into view. Closed days are strikethrough + disabled.
 *
 * The parent may push a new `selectedDate` (e.g., after picking in the full
 * month view). When that happens the strip programmatically scrolls to the
 * matching week snap so the selection stays visible without breaking the
 * week-aligned layout.
 */
export function DayStrip({
  slots,
  selectedDate,
  onSelectDate,
  spanDays = 63,
}: Props) {
  // Anchor to Monday of the current week so every 7-slide chunk aligns to
  // a real week. Past days (Mon..today-1) render as disabled cells — they
  // have no density entry and get strikethrough via [aria-disabled="true"].
  const start = useMemo(
    () => startOfWeek(startOfToday(), { weekStartsOn: 1 }),
    [],
  );
  const days = useMemo(
    () => Array.from({ length: spanDays }, (_, i) => addDays(start, i)),
    [start, spanDays],
  );
  const densityMap = useMemo(() => computeDensityMap(slots), [slots]);

  const [emblaRef, emblaApi] = useEmblaCarousel({
    // `align: "start"` here (NOT `() => 20` like the chips). The day
    // strip's viewport has CSS `padding: 4px 20px 14px`, and the slide
    // widths are calc'd as `(100% - 6*gap) / 7` where 100% = the
    // viewport's content area (inside padding). Embla measures slide
    // alignment relative to that content area, so "start" already lands
    // Monday 20px from the drawer edge AND keeps Sunday 20px from the
    // right edge symmetrically. Adding a `() => 20` offset would double
    // up against the CSS padding and push Sunday past the right edge.
    align: "start",
    slidesToScroll: DAYS_PER_WEEK,
    dragFree: false,
    containScroll: "keepSnaps",
    skipSnaps: false,
    loop: false,
  });

  useEffect(() => {
    if (!emblaApi || !selectedDate) return;
    const slideIndex = days.findIndex((d) => isSameDay(d, selectedDate));
    if (slideIndex < 0) return;

    // Embla's `scrollTo` targets a scroll snap, not an individual slide.
    // With `slidesToScroll: 7`, each snap is a week group, so map the
    // selected day back to its containing week before scrolling.
    const snapIndex = Math.floor(slideIndex / DAYS_PER_WEEK);

    if (emblaApi.selectedScrollSnap() !== snapIndex) {
      emblaApi.scrollTo(snapIndex, false);
    }
  }, [emblaApi, days, selectedDate]);

  return (
    <div className="bru-day-strip" ref={emblaRef} aria-label="Upcoming days">
      <div className="bru-day-strip-track">
        {days.map((d) => {
          const density = densityMap.get(toKey(d));
          const hasSlots = !!density;
          const isFullyBooked = !!density?.isFullyBooked;
          const selected = selectedDate ? isSameDay(d, selectedDate) : false;
          return (
            <button
              key={d.toISOString()}
              type="button"
              className="bru-day-strip-slide"
              data-state={isFullyBooked ? "full" : hasSlots ? "open" : "closed"}
              aria-pressed={selected}
              aria-disabled={!hasSlots}
              aria-label={
                !density
                  ? `${d.toDateString()}, no slots`
                  : density.isFullyBooked
                    ? `${d.toDateString()}, fully booked`
                    : `${d.toDateString()}, ${density.count} open slots`
              }
              onClick={() => hasSlots && onSelectDate(d)}
            >
              <span className="bru-day-strip-weekday">
                {d
                  .toLocaleDateString(undefined, { weekday: "narrow" })
                  .toUpperCase()}
              </span>
              <span className="bru-day-strip-date">{d.getDate()}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
