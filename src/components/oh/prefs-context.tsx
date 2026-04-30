"use client";

import {
  createContext,
  useCallback,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useTheme } from "next-themes";
import { useMounted } from "@/hooks/use-mounted";
import { useRequiredContext } from "@/hooks/use-required-context";

export type Typeface = "grotesk" | "serif" | "mono";
export type Density = "airy" | "dense";

export type OhPrefsContextValue = {
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

export const OhPrefsContext =
  createContext<OhPrefsContextValue | null>(null);
OhPrefsContext.displayName = "OhPrefsContext.Provider";

export function OhPrefsProvider({
  children,
}: {
  children?: ReactNode;
}) {
  const mounted = useMounted();
  const [typeface, setTypeface] = useState<Typeface>("grotesk");
  const [density, setDensity] = useState<Density>("airy");
  const [motion, setMotion] = useState(true);

  const { theme: userTheme, resolvedTheme, setTheme } = useTheme();

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

  const value = useMemo<OhPrefsContextValue>(
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
    <OhPrefsContext.Provider value={value}>
      {children}
    </OhPrefsContext.Provider>
  );
}

export const useOhPrefs = () =>
  useRequiredContext(OhPrefsContext);
