"use client";

import { useEffect, useRef, type RefObject } from "react";

/**
 * Keeps a ref pointing at the latest render's value without causing re-renders
 * and without the lint-smelly "assign ref.current during render" pattern.
 *
 * Use when a long-lived callback (rAF loop, event listener, WebGL uniform
 * reader) needs to read the current value of a prop or state without being
 * torn down and rebuilt every time that value changes.
 */
export function useLatestRef<T>(value: T): RefObject<T> {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  });
  return ref;
}
