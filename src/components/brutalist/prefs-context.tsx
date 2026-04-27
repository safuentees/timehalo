"use client";

import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useTheme } from "next-themes";
import { useRequiredContext } from "@/hooks/use-required-context";

export type Typeface = "grotesk" | "serif" | "mono";
export type Density = "airy" | "dense";

export type BrutalistPrefsContextValue = {
  typeface: Typeface;
  setTypeface: (v: Typeface) => void;
  density: Density;
  setDensity: (v: Density) => void;
  motion: boolean;
  setMotion: (v: boolean) => void;
  theme: string | undefined;
  setTheme: (v: string) => void;
  isDark: boolean;
  toggleTheme: () => void;
};

export const BrutalistPrefsContext =
  createContext<BrutalistPrefsContextValue | null>(null);
BrutalistPrefsContext.displayName = "BrutalistPrefsContext.Provider";

export function BrutalistPrefsProvider({
  children,
}: {
  children?: ReactNode;
}) {
  const [mounted, setMounted] = useState(false);
  const [typeface, setTypeface] = useState<Typeface>("grotesk");
  const [density, setDensity] = useState<Density>("airy");
  const [motion, setMotion] = useState(true);

  const { theme: userTheme, resolvedTheme, setTheme } = useTheme();

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  const theme = mounted ? resolvedTheme : undefined;
  const isDark = theme === "dark";

  const toggleTheme = useCallback(() => {
    setTheme(
      userTheme === "system"
        ? "light"
        : userTheme === "light"
          ? "dark"
          : "system",
    );
  }, [userTheme, setTheme]);

  const value = useMemo<BrutalistPrefsContextValue>(
    () => ({
      typeface,
      setTypeface,
      density,
      setDensity,
      motion,
      setMotion,
      theme,
      setTheme,
      isDark,
      toggleTheme,
    }),
    [typeface, density, motion, theme, setTheme, isDark, toggleTheme],
  );

  return (
    <BrutalistPrefsContext.Provider value={value}>
      {children}
    </BrutalistPrefsContext.Provider>
  );
}

export const useBrutalistPrefs = () =>
  useRequiredContext(BrutalistPrefsContext);
