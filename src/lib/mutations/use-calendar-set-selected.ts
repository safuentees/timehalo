"use client";

import { toast } from "sonner";
import { trpc, type ReactQueryOptions } from "@/trpc/hooks";

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
