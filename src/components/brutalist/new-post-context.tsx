"use client";

import {
  createContext,
  useCallback,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useRequiredContext } from "@/hooks/use-required-context";

export type NewPostContextValue = {
  open: boolean;
  openNewPost: () => void;
  closeNewPost: () => void;
};

export const NewPostContext = createContext<NewPostContextValue | null>(null);
NewPostContext.displayName = "NewPostContext.Provider";

export function NewPostProvider({ children }: { children?: ReactNode }) {
  const [open, setOpen] = useState(false);

  const openNewPost = useCallback(() => setOpen(true), []);
  const closeNewPost = useCallback(() => setOpen(false), []);

  const value = useMemo<NewPostContextValue>(
    () => ({ open, openNewPost, closeNewPost }),
    [open, openNewPost, closeNewPost],
  );

  return (
    <NewPostContext.Provider value={value}>{children}</NewPostContext.Provider>
  );
}

export const useNewPost = () => useRequiredContext(NewPostContext);
