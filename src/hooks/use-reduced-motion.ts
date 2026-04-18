"use client";

import { useSyncExternalStore } from "react";

const MQ_STRING = "(prefers-reduced-motion: reduce)";

function subscribe(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const mq = window.matchMedia(MQ_STRING);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

function getSnapshot(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia(MQ_STRING).matches;
}

function getServerSnapshot(): boolean {
  return false;
}

/**
 * `true` when the user has `prefers-reduced-motion: reduce` set.
 *
 * Uses `useSyncExternalStore` so the value is kept in sync with the OS
 * setting across renders with no per-component `useEffect` + ref
 * orchestration. SSR-safe.
 */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
