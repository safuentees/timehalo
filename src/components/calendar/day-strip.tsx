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

type Props = {
  slots: Slot[];
  selectedDate: Date | undefined;
  onSelectDate: (d: Date) => void;
  spanDays?: number;
};

export function DayStrip({
  slots,
  selectedDate,
  onSelectDate,
  spanDays = 63,
}: Props) {
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
    align: "start",
    slidesToScroll: 7,
    dragFree: false,
    containScroll: "keepSnaps",
    skipSnaps: false,
    loop: false,
  });

  useEffect(() => {
    if (!emblaApi || !selectedDate) return;
    const idx = days.findIndex((d) => isSameDay(d, selectedDate));
    if (idx >= 0) emblaApi.scrollTo(idx, false);
  }, [emblaApi, days, selectedDate]);

  return (
    <div className="bru-day-strip" ref={emblaRef} aria-label="Upcoming days">
      <div className="bru-day-strip-track">
        {days.map((d) => {
          const density = densityMap.get(toKey(d));
          const available = !!density;
          const selected = selectedDate ? isSameDay(d, selectedDate) : false;
          return (
            <button
              key={d.toISOString()}
              type="button"
              className="bru-day-strip-slide"
              aria-pressed={selected}
              aria-disabled={!available}
              aria-label={
                available
                  ? `${d.toDateString()}, ${density.count} slots`
                  : `${d.toDateString()}, no slots`
              }
              onClick={() => available && onSelectDate(d)}
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
