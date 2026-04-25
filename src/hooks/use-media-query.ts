"use client";

import { useEffect, useState } from "react";

// Generic media-query subscription. Modeled on shadcn's `useIsMobile` —
// `matchMedia.addEventListener('change', ...)` only fires when the viewport
// crosses the threshold, so there's no resize-storm and no work between ticks.
//
// Returns `false` until the first client effect runs, which avoids an
// SSR/hydration disagreement when the hook drives a conditional subtree.
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}
