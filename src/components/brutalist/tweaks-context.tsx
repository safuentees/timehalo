"use client";

import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useRequiredContext } from "@/hooks/use-required-context";
import {
  HALFTONE_DEFAULTS,
  type HalftoneTweaks,
} from "@/lib/halftone-defaults";

const STORAGE_KEY = "bru:tweaks";

export type HalftoneTweaksContextValue = {
  tweaks: HalftoneTweaks;
  updateTweaks: (patch: Partial<HalftoneTweaks>) => void;
};

export const HalftoneTweaksContext =
  createContext<HalftoneTweaksContextValue | null>(null);
HalftoneTweaksContext.displayName = "HalftoneTweaksContext.Provider";

export function HalftoneTweaksProvider({
  children,
}: {
  children?: ReactNode;
}) {
  const [tweaks, setTweaks] = useState<HalftoneTweaks>(HALFTONE_DEFAULTS);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<HalftoneTweaks>;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTweaks((prev) => ({ ...prev, ...parsed }));
    } catch {
    }
  }, []);

  const updateTweaks = useCallback((patch: Partial<HalftoneTweaks>) => {
    setTweaks((prev) => {
      const next = { ...prev, ...patch };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
      }
      return next;
    });
  }, []);

  const value = useMemo<HalftoneTweaksContextValue>(
    () => ({ tweaks, updateTweaks }),
    [tweaks, updateTweaks],
  );

  return (
    <HalftoneTweaksContext.Provider value={value}>
      {children}
    </HalftoneTweaksContext.Provider>
  );
}

export const useHalftoneTweaks = () =>
  useRequiredContext(HalftoneTweaksContext);
