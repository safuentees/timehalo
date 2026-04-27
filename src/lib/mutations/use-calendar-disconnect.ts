"use client";

import { toast } from "sonner";
import { trpc, type ReactQueryOptions } from "@/trpc/hooks";

// Custom mutation hook for `calendar.disconnect`. Drops a connected
// CalendarCredential (and its SelectedCalendar rows by cascade).
// Global invalidation in src/trpc/hooks.ts refreshes calendar
// queries automatically.

type Options = ReactQueryOptions["calendar"]["disconnect"];

export function useCalendarDisconnect(options?: Options) {
  return trpc.calendar.disconnect.useMutation({
    ...options,
    onSuccess: async (...args) => {
      toast.success("Calendar disconnected.");
      await options?.onSuccess?.(...args);
    },
    onError: (...args) => {
      const [error] = args;
      toast.error(error.message);
      options?.onError?.(...args);
    },
  });
}
