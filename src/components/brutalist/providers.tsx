"use client";

import type { ReactNode } from "react";
import { HalftoneTweaksProvider } from "./tweaks-context";
import { BrutalistPrefsProvider } from "./prefs-context";
import { NewPostProvider } from "./new-post-context";

export function BrutalistProviders({ children }: { children: ReactNode }) {
  return (
    <BrutalistPrefsProvider>
      <HalftoneTweaksProvider>
        <NewPostProvider>{children}</NewPostProvider>
      </HalftoneTweaksProvider>
    </BrutalistPrefsProvider>
  );
}
