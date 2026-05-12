"use client";

import { useCallback, useRef, useSyncExternalStore } from "react";

export function useCurrentMinute(): Date | null {
  const nowRef = useRef<Date | null>(null);

  const subscribe = useCallback((onStoreChange: () => void) => {
    nowRef.current = new Date();
    onStoreChange();
    let intervalId: ReturnType<typeof setInterval> | null = null;
    const msUntilNextMinute = 60_000 - (Date.now() % 60_000);
    const timeoutId = setTimeout(() => {
      nowRef.current = new Date();
      onStoreChange();
      intervalId = setInterval(() => {
        nowRef.current = new Date();
        onStoreChange();
      }, 60_000);
    }, msUntilNextMinute);
    return () => {
      clearTimeout(timeoutId);
      if (intervalId) clearInterval(intervalId);
      nowRef.current = null;
    };
  }, []);

  return useSyncExternalStore(
    subscribe,
    () => nowRef.current,
    () => null,
  );
}
