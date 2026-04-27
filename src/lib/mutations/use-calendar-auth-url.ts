"use client";

import { toast } from "sonner";
import { trpc, type ReactQueryOptions } from "@/trpc/hooks";

type Options = ReactQueryOptions["calendar"]["authUrl"];

export function useCalendarAuthUrl(options?: Options) {
  return trpc.calendar.authUrl.useMutation({
    ...options,
    onSuccess: async (...args) => {
      const [data] = args;
      await options?.onSuccess?.(...args);
      window.location.href = data.url;
    },
    onError: (...args) => {
      const [error] = args;
      if (error.data?.code !== "PRECONDITION_FAILED") {
        toast.error(error.message);
      }
      options?.onError?.(...args);
    },
  });
}
