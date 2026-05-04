"use client";

import { useEffect, useState } from "react";

export function useCurrentMinute(): Date {
  const [now, setNow] = useState<Date>(() => new Date());

  useEffect(() => {
    const tick = () => setNow(new Date());
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
