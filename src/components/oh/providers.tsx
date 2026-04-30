"use client";

import type { ReactNode } from "react";
import { OhPrefsProvider } from "./prefs-context";

export function OhProviders({ children }: { children: ReactNode }) {
  return <OhPrefsProvider>{children}</OhPrefsProvider>;
}
