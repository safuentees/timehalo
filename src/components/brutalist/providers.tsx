"use client";

import type { ReactNode } from "react";
import { HalftoneTweaksProvider } from "./tweaks-context";
import { BrutalistPrefsProvider } from "./prefs-context";

export function BrutalistProviders({ children }: { children: ReactNode }) {
  return (
    <BrutalistPrefsProvider>
      <HalftoneTweaksProvider>{children}</HalftoneTweaksProvider>
    </BrutalistPrefsProvider>
  );
}
