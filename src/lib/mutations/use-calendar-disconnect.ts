"use client";

import { toast } from "sonner";
import { trpc, type ReactQueryOptions } from "@/trpc/hooks";

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
