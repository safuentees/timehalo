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
  // Was `useState(false) + useEffect(() => setMounted(true), [])` — the
  // pattern AGENTS.md "Never do" list bans because React 19's compiler
  // ESLint rule (`react-hooks/set-state-in-effect`) flags it. The
  // `useMounted()` hook routes through `useSyncExternalStore` with an
  // explicit server-snapshot of `false`, so SSR + first client paint
  // both see `mounted=false` deterministically — no fiber re-render
  // ripple, no useId counter drift downstream. The earlier shape
  // shipped a ban-violation comment (eslint-disable-next-line); this
  // matches the chrome rule.
  const mounted = useMounted();
  const [typeface, setTypeface] = useState<Typeface>("grotesk");
  const [density, setDensity] = useState<Density>("airy");
  const [motion, setMotion] = useState(true);

  const { theme: userTheme, resolvedTheme, setTheme } = useTheme();

  const theme = mounted ? resolvedTheme : undefined;
  const isDark = theme === "dark";

  // Tri-state cycle: system → light → dark → system. The previous
  // implementation read `resolvedTheme` and called setTheme based on
  // it — which silently pulled the user out of "system" mode the
  // first time they clicked the topbar toggle, breaking OS-sync
  // forever after. Use the user-pick `theme` (from useTheme()) for
  // the cycle so "system" survives a click and is reachable by
  // clicking past dark.
  // Reference: next-themes FAQ — `theme` is the pick, `resolvedTheme`
  // is what's rendered. https://github.com/pacocoursey/next-themes
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
