"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

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

export function usePageTitleValue(): string | null {
  return useContext(PageTitleContext)?.title ?? null;
}
