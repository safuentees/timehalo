"use client";

import { toast } from "sonner";
import { trpc, type ReactQueryOptions } from "@/trpc/hooks";

// Custom mutation hook for `calendar.setSelected`. Replaces the
// selection set for a connected credential. The procedure is
// idempotent — full target list in, server reconciles inserts +
// deletes inside one transaction.

type Options = ReactQueryOptions["calendar"]["setSelected"];

export function useCalendarSetSelected(options?: Options) {
  return trpc.calendar.setSelected.useMutation({
    ...options,
    onSuccess: async (...args) => {
      toast.success("Calendars updated.");
      await options?.onSuccess?.(...args);
    },
    onError: (...args) => {
      const [error] = args;
      toast.error(error.message);
      options?.onError?.(...args);
    },
  });
}
