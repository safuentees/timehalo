"use client";

import { useEffect, useState } from "react";

// Tick once per minute on the wall-clock minute boundary, so the
// current-time line in time-grid views moves smoothly without
// burning render cycles every second.
//
// Returns a Date snapshot (re-created each tick so consumers see
// reference equality change). The first effect run schedules the
// next tick at the upcoming minute boundary, then a setInterval
// every 60s. The interval is the wall-clock minute, not 60s after
// hook mount, so two component instances stay aligned.
//
// Server snapshot: returns the date the hook first ran with on the
// client. SSR users render the time line at the same y-position the
// server saw, then the first tick after mount snaps to the next
// minute boundary. No flash because the position only moves by
// `--one-minute-height` each tick (~0.5-1px depending on grid scale).

export function useCurrentMinute(): Date {
  const [now, setNow] = useState<Date>(() => new Date());

  useEffect(() => {
    const tick = () => setNow(new Date());
    // First scheduled tick: the next minute boundary.
    const msUntilNextMinute =
      60_000 - (Date.now() % 60_000);
    let intervalId: ReturnType<typeof setInterval> | null = null;
    const timeoutId = setTimeout(() => {
      tick();
      intervalId = setInterval(tick, 60_000);
    }, msUntilNextMinute);
    return () => {
      clearTimeout(timeoutId);
      if (intervalId) clearInterval(intervalId);
    };
  }, []);

  return now;
}
