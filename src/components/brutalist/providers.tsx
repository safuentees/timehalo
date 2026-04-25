"use client";

import type { ReactNode } from "react";
import { BrutalistPrefsProvider } from "./prefs-context";

export function BrutalistProviders({ children }: { children: ReactNode }) {
  return <BrutalistPrefsProvider>{children}</BrutalistPrefsProvider>;
}
