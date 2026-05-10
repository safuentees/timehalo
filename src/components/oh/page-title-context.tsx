"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

// Page-title channel from any descendant page → the dashboard top
// bar (B.PT304). A page calls `usePageTitle(string)` in an effect
// to register its title; the bar reads `usePageTitleValue()` and
// renders the active title between the workspace switcher and the
// user menu (≥md). Pages can opt OUT of the in-column page header
// when they call this (cal-style chrome) or render BOTH (richer
// content surfaces like /settings where the in-column header
// carries narrative weight).
//
// Why a context, not just a Zustand/jotai store: the lifecycle is
// strictly tied to the page's mount, so React's effect cleanup is
// the right "unset on unmount" hook. Context state lives in the
// dashboard layout — single owner, no cross-tab persistence
// needed.

type PageTitleContextValue = {
  title: string | null;
  setTitle: (title: string | null) => void;
};

const PageTitleContext = createContext<PageTitleContextValue | null>(null);

export function PageTitleProvider({ children }: { children: ReactNode }) {
  const [title, setTitle] = useState<string | null>(null);
  return (
    <PageTitleContext.Provider value={{ title, setTitle }}>
      {children}
    </PageTitleContext.Provider>
  );
}

// Page-side hook — sets the bar title for the lifetime of the
// component's mount. Pass `null` to clear (or simply unmount).
// Effect dependency on `title` so a route that recomputes its
// localized title (locale switch) refreshes the bar.
export function usePageTitle(title: string | null) {
  const ctx = useContext(PageTitleContext);
  useEffect(() => {
    if (!ctx) return;
    ctx.setTitle(title);
    return () => {
      ctx.setTitle(null);
    };
  }, [ctx, title]);
}

// Bar-side hook — read the active title. Returns null when no
// page has registered (e.g. the dashboard root before any nested
// route renders).
export function usePageTitleValue(): string | null {
  return useContext(PageTitleContext)?.title ?? null;
}
