"use client";

import { useEffect, useState } from "react";

// Tick once per minute on the wall-clock minute boundary, so the
// current-time line in time-grid views moves smoothly without
// burning render cycles every second.
//
// Returns `Date | null`. Initial value is `null` so SSR and the first
// client render produce identical HTML — no current-time line painted
// until `useEffect` runs post-hydration. After mount, the line snaps
// in at the wall-clock position. Without this null-on-SSR contract,
// the lazy `useState(() => new Date())` initializer ran on BOTH the
// server pass AND the hydration pass with ~1s elapsed between them,
// producing different `top: "Npx"` values and a hydration mismatch
// warning (React 19's hydration-mismatch docs flag `Date.now()` /
// `Math.random()` in render as the canonical anti-pattern).
//
// Tick cadence: first effect run schedules a timeout to the upcoming
// minute boundary, then `setInterval` every 60s. The interval aligns
// with the wall-clock minute so two component instances stay
// synchronized.

export function useCurrentMinute(): Date | null {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const tick = () => setNow(new Date());
    // First scheduled tick: the next minute boundary.
    const msUntilNextMinute = 60_000 - (Date.now() % 60_000);
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
