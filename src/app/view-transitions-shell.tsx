"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { ViewTransitions } from "next-view-transitions";

const PUBLIC_VISITOR_PREFIXES = ["/h/", "/w/"];

export function ViewTransitionsShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isPublicVisitorRoute =
    pathname === "/h" ||
    pathname === "/w" ||
    PUBLIC_VISITOR_PREFIXES.some((prefix) => pathname?.startsWith(prefix));

  if (isPublicVisitorRoute) return <>{children}</>;

  return <ViewTransitions>{children}</ViewTransitions>;
}
